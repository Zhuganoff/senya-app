/* AISports private account client, API v1. No secrets or Telegram data in URLs/storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AISportsBotAccount = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const API_VERSION = 1, CHAIN = 137;
  const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
  const ADDRESS = /^0x[0-9a-f]{40}$/i;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const TERMINAL = new Set(["CONFIRMED", "FAILED", "REJECTED", "CANCELLED", "EXPIRED"]);
  // Operations that still need the user or are about to: a new transfer waits for them. WALLET_PENDING,
  // SUBMITTED and UNKNOWN only wait for the chain; their amounts are held and the rest stays usable.
  const INTERACTIVE = new Set(["PENDING", "CLAIMED", "AWAITING_SIGNATURE"]);
  const SOURCES = ["POLYMARKET", "METAMASK"], MIN_GAS_WEI = 10n ** 16n, SNAPSHOT_MAX_AGE = 120000;
  class ClientError extends Error { constructor(code, detail) { super(code); this.code = code; if (detail) this.detail = String(detail).slice(0, 160); } }
  const fail = code => { throw new ClientError(code); };
  const address = x => typeof x === "string" && ADDRESS.test(x) ? x.toLowerCase() : fail("INVALID_ADDRESS");
  const integer = x => (typeof x === "string" && /^(0|[1-9][0-9]*)$/.test(x)) ? BigInt(x) : fail("INVALID_AMOUNT");
  function parseUnits(value) {
    if (typeof value !== "string" || !/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/.test(value)) fail("INVALID_AMOUNT");
    const [whole, fraction = ""] = value.split(".");
    const n = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
    if (n <= 0n || n >= 2n ** 256n) fail("INVALID_AMOUNT");
    return n.toString();
  }
  function formatUnits(value) {
    if (value == null) return "—";
    try {
      const n = integer(value), f = (n % 1000000n).toString().padStart(6, "0").replace(/0+$/, "");
      return (n / 1000000n).toString() + (f ? "." + f : "");
    } catch (_) { return "—"; }
  }
  function signedUnits(value) {
    if (typeof value !== "string" || !/^-?(0|[1-9][0-9]*)$/.test(value)) return "—";
    return (value[0] === "-" ? "−" : "") + formatUnits(value.replace(/^-/, ""));
  }
  function errorCode(e) {
    if (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) return "WALLET_REJECTED";
    if (e instanceof ClientError) return e.code;
    const m = String(e && e.message || e || "");
    if (m === "WALLET_UNAVAILABLE") return "WALLET_UNAVAILABLE";            // модуль MetaMask не загрузился / не создался
    if (/^rpc \d{3}$/.test(m)) return "SOURCE_HTTP";                         // база ответила ошибкой HTTP (номер — в подробностях)
    return "SOURCE_UNAVAILABLE";
  }
  // Владелец 25.09: «Источник недоступен» ничего не объясняет — к каждой ошибке добавляется шаг и текст причины.
  function errorDetail(e, step) {
    const m = e && (e.detail || e.message) ? String(e.detail || e.message) : String(e || "");
    return (step ? step + ": " : "") + m.slice(0, 160);
  }
  function envelope(r) {
    if (!r || r.api_version !== API_VERSION) fail("VERSION_MISMATCH");
    if (!["OK", "NOT_CREATED", "NOT_CONNECTED", "PENDING"].includes(r.status)) fail(/^[A-Z0-9_:]+$/.test(r.status || "") ? r.status : "REQUEST_REJECTED");
    return r;
  }
  function accountCheck(a) {
    if (!a || !UUID.test(a.account_id) || !Number.isSafeInteger(a.version) || a.chain_id !== CHAIN) fail("ACCOUNT_MISMATCH");
    address(a.verified_user_signer); address(a.funding_wallet);
    if (a.bot_deposit_wallet) {
      if (address(a.bot_deposit_wallet) === address(a.funding_wallet)) fail("ACCOUNT_MISMATCH");
      if (address(a.bot_owner_address) === address(a.verified_user_signer)) fail("ACCOUNT_MISMATCH");
    }
    if (a.collateral && address(a.collateral) !== PUSD) fail("WRONG_TOKEN");
    if (a.policy) {
      const p = a.policy;
      if (!Number.isSafeInteger(p.version) || !Number.isSafeInteger(p.max_stake_bps) || p.max_stake_bps < 1 || p.max_stake_bps > 1000 ||
          !Array.isArray(p.sports) || p.sports.length !== 1 || p.sports[0] !== "mlb" || !Number.isSafeInteger(p.max_open) || p.max_open < 1) fail("POLICY_UNAVAILABLE");
    }
    return a;
  }
  function exactKeys(o, keys) {
    if (!o || typeof o !== "object" || Array.isArray(o) || Object.keys(o).sort().join("|") !== keys.slice().sort().join("|")) fail("UNSAFE_SIGNATURE");
  }
  function checkTypes(td, expected) {
    const actual = {...td.types}; delete actual.EIP712Domain;
    exactKeys(actual,Object.keys(expected));
    for(const name of Object.keys(expected)) if(JSON.stringify(actual[name])!==JSON.stringify(expected[name])) fail("UNSAFE_SIGNATURE");
    if (td.types.EIP712Domain && JSON.stringify(td.types.EIP712Domain) !== JSON.stringify([
      {name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"},{name:"verifyingContract",type:"address"}
    ])) fail("UNSAFE_SIGNATURE");
  }
  function validateTransfer(operation, account, now = Date.now()) {
    accountCheck(account);
    const o = operation, i = o && o.intent, c = o && o.challenge;
    if (!o || !UUID.test(o.operation_id) || !i || !c || o.state !== "AWAITING_SIGNATURE") fail("NOT_READY_TO_SIGN");
    if (!["FUNDING", "WITHDRAW"].includes(o.kind) || i.kind !== o.kind || i.operation_id !== o.operation_id || i.account_id !== account.account_id) fail("OPERATION_MISMATCH");
    if (i.chain_id !== CHAIN || address(i.token) !== PUSD || address(account.collateral) !== PUSD) fail("WRONG_CHAIN_OR_TOKEN");
    if (i.nonce !== o.operation_id || i.amount_units !== o.amount_units || integer(i.amount_units) <= 0n) fail("OPERATION_MISMATCH");
    const funding = o.kind === "FUNDING";
    const source = address(funding ? account.funding_wallet : account.bot_deposit_wallet);
    const recipient = address(funding ? account.bot_deposit_wallet : account.funding_wallet);
    if (address(i.source) !== source || address(i.recipient) !== recipient || address(i.verified_user_signer) !== address(account.verified_user_signer) || address(c.signer) !== address(account.verified_user_signer)) fail("OPERATION_MISMATCH");
    const expiry = Date.parse(i.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 15 * 60000) fail("SIGNATURE_EXPIRED");
    const td = c.typed_data, m = td && td.message, d = td && td.domain;
    if (!td || !m || !d || !td.types) fail("UNSAFE_SIGNATURE");
    exactKeys(td, ["types", "primaryType", "domain", "message"]);
    exactKeys(d, ["name", "version", "chainId", "verifyingContract"]);
    if (Number(d.chainId) !== CHAIN || d.version !== "1" || address(d.verifyingContract) !== source) fail("UNSAFE_SIGNATURE");
    if (funding) {
      if (td.primaryType !== "Batch" || d.name !== "DepositWallet") fail("UNSAFE_SIGNATURE");
      exactKeys(m, ["wallet", "calls", "nonce", "deadline"]);
      checkTypes(td, {Call:[{name:"target",type:"address"},{name:"value",type:"uint256"},{name:"data",type:"bytes"}],Batch:[{name:"wallet",type:"address"},{name:"nonce",type:"uint256"},{name:"deadline",type:"uint256"},{name:"calls",type:"Call[]"}]});
      if (!Array.isArray(m.calls) || m.calls.length !== 1) fail("UNSAFE_SIGNATURE");
      const call = m.calls[0]; exactKeys(call, ["target", "value", "data"]);
      const calldata = "0xa9059cbb" + recipient.slice(2).padStart(64,"0") + integer(i.amount_units).toString(16).padStart(64,"0");
      if (address(m.wallet) !== source || address(call.target) !== PUSD || String(call.value) !== "0" || String(call.data).toLowerCase() !== calldata || !/^[0-9]+$/.test(String(m.nonce)) || (typeof m.nonce==="number"&&!Number.isSafeInteger(m.nonce))) fail("UNSAFE_SIGNATURE");
      if (Number(m.deadline) !== Math.floor(expiry / 1000)) fail("SIGNATURE_EXPIRED");
    } else {
      if (td.primaryType !== "AISportsWithdrawal" || d.name !== "AISports") fail("UNSAFE_SIGNATURE");
      exactKeys(m, ["accountId","operationId","token","amount","recipient","nonce","deadline"]);
      checkTypes(td, {AISportsWithdrawal:[{name:"accountId",type:"string"},{name:"operationId",type:"string"},{name:"token",type:"address"},{name:"amount",type:"uint256"},{name:"recipient",type:"address"},{name:"nonce",type:"string"},{name:"deadline",type:"uint256"}]});
      if (m.accountId !== i.account_id || m.operationId !== i.operation_id || m.nonce !== i.nonce || address(m.token) !== PUSD || String(m.amount) !== i.amount_units || address(m.recipient) !== recipient || Number(m.deadline) !== Math.floor(expiry / 1000)) fail("UNSAFE_SIGNATURE");
    }
    return td;
  }
  function sourceOf(a, kind) {
    const want = kind === "POLYMARKET" ? a.funding_wallet : a.verified_user_signer;
    return (Array.isArray(a.sources) ? a.sources : []).find(x => x && x.source_kind === kind && String(x.address).toLowerCase() === String(want).toLowerCase()) || null;
  }
  // Instant client-side check on the service-written chain snapshot; the server repeats it before creating anything.
  function fundingCheck(s, units, now = Date.now()) {
    const base = {source_kind:s.source_kind,address:s.address,balance_units:s.balance_units,held_units:s.held_units,available_units:s.available_units,needed_units:units,checked_at:s.checked_at,block:s.block};
    if (s.fresh !== true || !(Date.parse(s.checked_at) > now - SNAPSHOT_MAX_AGE)) return {...base,status:"BALANCE_UNAVAILABLE"};
    if (s.source_kind === "POLYMARKET" && s.owner_ok === false) return {...base,status:"SOURCE_OWNER_MISMATCH"};
    if (integer(units) > integer(s.available_units)) return {...base,status:"INSUFFICIENT_BALANCE"};
    if (s.source_kind === "METAMASK" && BigInt(/^[0-9]+$/.test(String(s.pol_wei)) ? s.pol_wei : "0") < MIN_GAS_WEI) return {...base,status:"GAS_UNAVAILABLE"};
    return null;
  }
  // MetaMask route: a plain pUSD transfer from the verified EOA to this account. Every field is rebuilt locally.
  function validateWalletTransfer(operation, account, now = Date.now()) {
    accountCheck(account);
    const o = operation, i = o && o.intent, c = o && o.challenge;
    if (!o || !UUID.test(o.operation_id) || !i || !c || o.state !== "AWAITING_SIGNATURE" || o.kind !== "FUNDING" || o.source_kind !== "METAMASK") fail("NOT_READY_TO_SIGN");
    if (i.kind !== "FUNDING" || i.source_kind !== "METAMASK" || i.operation_id !== o.operation_id || i.account_id !== account.account_id) fail("OPERATION_MISMATCH");
    if (i.chain_id !== CHAIN || address(i.token) !== PUSD || address(account.collateral) !== PUSD) fail("WRONG_CHAIN_OR_TOKEN");
    const eoa = address(account.verified_user_signer), to = address(account.bot_deposit_wallet);
    if (i.amount_units !== o.amount_units || integer(i.amount_units) <= 0n || address(i.source) !== eoa || address(i.recipient) !== to || address(i.verified_user_signer) !== eoa) fail("OPERATION_MISMATCH");
    exactKeys(c, ["type","signer","from","token","recipient","amount_units","chain_id","data"]);
    const data = "0xa9059cbb" + to.slice(2).padStart(64,"0") + integer(i.amount_units).toString(16).padStart(64,"0");
    if (c.type !== "erc20_transfer" || address(c.signer) !== eoa || address(c.from) !== eoa || address(c.token) !== PUSD || address(c.recipient) !== to ||
        c.amount_units !== i.amount_units || c.chain_id !== CHAIN || String(c.data).toLowerCase() !== data) fail("UNSAFE_TRANSACTION");
    const expiry = Date.parse(i.expires_at);
    if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 15 * 60000) fail("SIGNATURE_EXPIRED");
    return {from:eoa, to:PUSD, data, value:"0x0"};
  }
  async function checkEligibility(fetcher) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
    try {
      const r=await fetcher("https://polymarket.com/api/geoblock",{method:"GET",credentials:"omit",cache:"no-store",referrerPolicy:"no-referrer",headers:{Accept:"application/json"},signal:controller.signal});
      if(!r.ok)fail("GEOBLOCK_UNVERIFIED");
      const data=await r.json();
      if(!data||typeof data.blocked!=="boolean"||typeof data.country!=="string"||!/^[A-Z]{2}$/i.test(data.country))fail("GEOBLOCK_UNVERIFIED");
      return !data.blocked;
    }catch(_){fail("GEOBLOCK_UNVERIFIED");}finally{clearTimeout(timer);}
  }

  class Controller {
    constructor({rpc, session, wallet, resolveWallet, eligibility = async()=>fail("GEOBLOCK_UNVERIFIED"), render = () => {}, uuid, now = Date.now, rpcTimeoutMs = 15000}) {
      this.rpcTimeoutMs = rpcTimeoutMs;
      this.rpc = rpc; this.session = session; this.wallet = wallet; this.resolveWallet = resolveWallet;
      this.render = render; this.uuid = uuid || (() => globalThis.crypto.randomUUID()); this.now = now;
      this.eligibility=eligibility;
      this.epoch = 0; this.auth = null; this.idempotency = new Map(); this.state = {};
    }
    reset() { this.epoch++; this.auth = this.session(); this.idempotency.clear(); this.state = {status:"SIGNED_OUT",account:null,operation:null,history:[],busy:false,error:null}; this.render(this.state); }
    context() {
      if (this.session() !== this.auth) this.reset();
      if (!this.auth) fail("SIGNED_OUT");
      return {auth:this.auth, epoch:this.epoch};
    }
    alive(c) { return c.auth === this.session() && c.epoch === this.epoch; }
    assert(c) { if (!this.alive(c)) {if(this.session()!==this.auth)this.reset();fail("SESSION_CHANGED");} }
    paint(c, update) { this.assert(c); this.state = {...this.state,...update}; this.render(this.state); }
    async call(c, name, params = {}, legacy = false) {
      this.assert(c); this._step = name;
      // A hung request must not keep the screen busy: bounded wait, then a named error. A lost reply to a
      // mutation is resolved by reading the operation again, never by repeating it blindly.
      let timer;
      const r = await Promise.race([this.rpc(name, {...params,p_init_data:c.auth}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new ClientError("SOURCE_TIMEOUT")), this.rpcTimeoutMs); })])
        .finally(() => clearTimeout(timer));
      this.assert(c);
      return legacy ? r : envelope(r);
    }
    key(action) { if (!this.idempotency.has(action)) this.idempotency.set(action,this.uuid()); return this.idempotency.get(action); }
    adopt(c, r) {
      if (r.account) accountCheck(r.account);
      if (r.account && this.state.account && r.account.account_id !== this.state.account.account_id) fail("ACCOUNT_CHANGED");
      const update = {status:r.status,error:null,errorDetail:null};
      if (Object.hasOwn(r,"account")) update.account = r.account;
      if (Object.hasOwn(r,"operation")) update.operation = r.operation;
      this.paint(c,update); return r;
    }
    async run(fn) {
      let c;
      try {
        c = this.context();
        if (this.state.busy) return null;
        this._actionRevision=(this._actionRevision||0)+1;
        this._runningContext=c;
        this.paint(c,{busy:true,error:null});
        return await fn(c);
      } catch(e) {
        if (c && this.alive(c)) this.paint(c,{error:errorCode(e),errorDetail:errorDetail(e,this._step)});
        return null;
      } finally { this._step=null; if (c && this.alive(c) && this._runningContext===c) {this._runningContext=null;this.paint(c,{busy:false});} }
    }
    async refresh() {
      return this.run(async c => {
        const r = this.adopt(c,await this.call(c,"bot_account_get"));
        if(r.status==="NOT_CONNECTED") {
          const proof=await this.call(c,"wallet_link_status",{},true);
          if(proof&&["PENDING","VERIFYING"].includes(proof.state))this.paint(c,{status:"OWNERSHIP_PENDING"});
        }
        if (r.account) {
          const h = await this.call(c,"bot_account_history");
          if (!Array.isArray(h.operations)) fail("INVALID_HISTORY");
          const unfinished=h.operations.find(o=>!TERMINAL.has(o.state));
          // Resume only unfinished work. Old refusals belong in the future history screen, not the wallet card.
          const current=this.state.operation;
          this.paint(c,{history:h.operations,operation:unfinished||current||null});
          if (this.state.operation && !TERMINAL.has(this.state.operation.state)) {
            this.adopt(c,await this.call(c,"bot_account_operation",{p_operation_id:this.state.operation.operation_id}));
          }
        }
        return r;
      });
    }
    async pollOperation(id) {
      let c,revision;
      try {
        c=this.context();
        if(this.state.busy||this._runningContext||this._polling||this.state.operation?.operation_id!==id)return false;
        revision=this._actionRevision||0;
        this._polling=true;
        const r=await this.call(c,"bot_account_operation",{p_operation_id:id});
        if(!r.operation||r.operation.operation_id!==id)fail("OPERATION_MISMATCH");
        if(this.state.busy||this._runningContext||this._actionRevision!==revision||this.state.operation?.operation_id!==id)return false;
        if(JSON.stringify(r.operation)!==JSON.stringify(this.state.operation))this.paint(c,{operation:r.operation,error:null});
        return TERMINAL.has(r.operation.state);
      }catch(e){
        if(c&&this.alive(c)&&this._actionRevision===revision&&!this.state.busy&&!this._runningContext&&this.state.error!==errorCode(e))this.paint(c,{error:errorCode(e)});
        return false;
      }finally{this._polling=false;}
    }
    async create(accepted) {
      return this.run(async c => {
        if (accepted !== true) fail("CUSTODY_ACCEPT_REQUIRED");
        return this.adopt(c,await this.call(c,"bot_account_create",{p_idempotency_key:this.key("create")}));
      });
    }
    async retryProvision() {
      return this.run(async c => {
        const a=accountCheck(this.state.account);
        if(a.state!=="ERROR"||a.reason!=="PROVIDER_ACCESS_DENIED")fail("NOT_RETRYABLE");
        return this.adopt(c,await this.call(c,"bot_account_retry",{p_idempotency_key:this.key("retry:"+a.version)}));
      });
    }
    async settings(maxPercent) {
      return this.run(async c => {
        if (typeof maxPercent !== "string" || !/^(0|[1-9][0-9]?)(\.[0-9]{1,2})?$/.test(maxPercent)) fail("INVALID_POLICY");
        const [w,f=""] = maxPercent.split("."), bps = Number(w)*100 + Number(f.padEnd(2,"0"));
        if (bps < 1 || bps > 1000) fail("INVALID_POLICY");
        const a = accountCheck(this.state.account);
        if (!a.policy) fail("POLICY_UNAVAILABLE");
        return this.adopt(c,await this.call(c,"bot_account_settings",{p_settings:{sports:["mlb"],max_stake_bps:bps},p_expected_version:a.policy.version,p_idempotency_key:this.key("settings:"+a.policy.version+":"+bps)}));
      });
    }
    async enable(accepted) {
      return this.run(async c => {
        const a = accountCheck(this.state.account);
        if (accepted !== true || !a.policy) fail("POLICY_ACCEPT_REQUIRED");
        const eligible=await this.eligibility();this.assert(c);
        if(eligible!==true)fail(eligible===false?"GEOBLOCKED":"GEOBLOCK_UNVERIFIED");
        return this.adopt(c,await this.call(c,"bot_account_enable",{p_expected_version:a.policy.version,p_idempotency_key:this.key("enable:"+a.policy.version)}));
      });
    }
    async stop() {
      return this.run(async c => {
        const a = accountCheck(this.state.account);
        return this.adopt(c,await this.call(c,"bot_account_stop",{p_idempotency_key:this.key("stop:"+(a.policy?a.policy.version:a.version))}));
      });
    }
    async prepare(kind, amount, source = kind === "FUNDING" ? "POLYMARKET" : undefined) {
      return this.run(async c => {
        if (!["FUNDING","WITHDRAW"].includes(kind)) fail("INVALID_OPERATION");
        const a = accountCheck(this.state.account), units = parseUnits(amount), o = this.state.operation;
        if (o && (kind === "WITHDRAW" ? !TERMINAL.has(o.state) : INTERACTIVE.has(o.state))) fail("OPERATION_IN_PROGRESS");
        if (kind === "WITHDRAW" && (!a.balance || integer(units) > integer(a.balance.available_units))) fail("INSUFFICIENT_AVAILABLE");
        const params = {p_kind:kind,p_amount:amount};
        if (kind === "FUNDING") {
          if (!SOURCES.includes(source)) fail("SOURCE_REQUIRED");
          const snap = sourceOf(a, source), check = snap && fundingCheck(snap, units, this.now());
          if (check) { this.paint(c,{fundingCheck:check}); fail(check.status); }     // refused before any request or wallet
          params.p_source = source;
        }
        const action=kind+":"+(source||"")+":"+units+":"+a.version;
        const raw = await this.call(c,"bot_account_prepare_transfer",{...params,p_idempotency_key:this.key(action)},true);
        if (raw && raw.account) { accountCheck(raw.account); this.paint(c,{account:raw.account,fundingCheck:raw.funding_check||null}); }
        const r = this.adopt(c,envelope(raw));
        if (!r.operation || r.operation.kind !== kind || r.operation.amount_units !== units || (kind === "FUNDING" && (r.operation.source_kind || "POLYMARKET") !== source)) fail("OPERATION_MISMATCH");
        this.idempotency.delete(action); // The server now owns this operation; a later completed transfer may be followed by another of the same amount.
        this.paint(c,{reviewed:false,fundingCheck:null}); return r;
      });
    }
    async cancelTransfer() {
      return this.run(async c => {
        const o = this.state.operation;
        if (!o || o.state !== "AWAITING_SIGNATURE" || o.source_kind !== "METAMASK") fail("NOT_CANCELLABLE");
        return this.adopt(c,await this.call(c,"bot_account_cancel_unsent",{p_operation_id:o.operation_id,p_reason:"CANCELLED"}));
      });
    }
    async sendFromWallet(accepted) {
      return this.run(async c => {
        if (accepted !== true) fail("TRANSFER_ACCEPT_REQUIRED");
        const a = accountCheck(this.state.account), reviewed = this.state.operation, id = reviewed && reviewed.operation_id;
        if (!reviewed || reviewed.state !== "AWAITING_SIGNATURE" || reviewed.source_kind !== "METAMASK") fail("NOT_READY_TO_SIGN");
        const r = await this.call(c,"bot_account_operation",{p_operation_id:id});
        const o = r.operation, tx = validateWalletTransfer(o,a,this.now());
        if (o.operation_id !== id || JSON.stringify(o.intent) !== JSON.stringify(reviewed.intent) || JSON.stringify(o.challenge) !== JSON.stringify(reviewed.challenge)) fail("OPERATION_MISMATCH");
        this.adopt(c,r);
        const provider = await this.openWallet(); this.assert(c);
        const selected = await provider.request({method:"eth_requestAccounts"}); this.assert(c);
        // Another address is never substituted silently; the user selects the verified one and retries.
        if (!Array.isArray(selected) || !selected.length || String(selected[0]).toLowerCase() !== tx.from) fail("WALLET_CHANGED");
        const refuse = async reason => { this.adopt(c,await this.call(c,"bot_account_cancel_unsent",{p_operation_id:id,p_reason:reason})); fail("NOT_SENT_"+reason); };
        if (BigInt(await provider.request({method:"eth_chainId"})) !== 137n) await refuse("CHAIN_MISMATCH");
        const held = BigInt(await provider.request({method:"eth_call",params:[{to:PUSD,data:"0x70a08231"+tx.from.slice(2).padStart(64,"0")},"latest"]})); this.assert(c);
        if (held < integer(o.amount_units)) await refuse("BALANCE_LOW");
        const gas = BigInt(await provider.request({method:"eth_estimateGas",params:[{from:tx.from,to:tx.to,data:tx.data,value:tx.value}]}));
        const price = BigInt(await provider.request({method:"eth_gasPrice"}));
        const pol = BigInt(await provider.request({method:"eth_getBalance",params:[tx.from,"latest"]})); this.assert(c);
        if (pol < gas * price * 12n / 10n) await refuse("GAS_LOW");
        validateWalletTransfer(o,a,this.now());
        // begin = the wallet may open now. Not a send; from here the operation only ends by chain reconciliation.
        let begun;
        try { begun = this.adopt(c,await this.call(c,"bot_account_begin_wallet_tx",{p_operation_id:id})); }
        catch (e) {
          if (!this.alive(c)) throw e;
          begun = this.adopt(c,await this.call(c,"bot_account_operation",{p_operation_id:id}));
          if (!begun.operation || begun.operation.state !== "WALLET_PENDING") throw e;
        }
        if (!begun.operation || begun.operation.state !== "WALLET_PENDING") fail("WALLET_NOT_STARTED");
        // Records an unknown wallet outcome. If even that write fails, the screen says so explicitly: the
        // operation stays uncertain (server: WALLET_PENDING, reconciled by the service), never REJECTED, never re-sent.
        const unknownOutcome = async (outcome, code) => {
          try { this.adopt(c,await this.call(c,"bot_account_wallet_outcome",{p_operation_id:id,p_outcome:outcome})); }
          catch (e) {
            if (!this.alive(c)) throw e;
            this.paint(c,{operation:{...this.state.operation,state:"UNKNOWN",reason:"WALLET_OUTCOME_UNRECORDED",challenge:null}});
            fail("WALLET_OUTCOME_UNRECORDED");
          }
          fail(code);
        };
        let hash;
        try { hash = await provider.request({method:"eth_sendTransaction",params:[{...tx,chainId:"0x89"}]}); }
        catch (e) {
          const declined = !!e && (e.code === 4001 || e.code === "ACTION_REJECTED");
          // A decline reported by the wallet is not proof that nothing was broadcast: outcome stays unknown.
          await unknownOutcome(declined ? "DECLINED" : "LOST", declined ? "WALLET_DECLINE_REPORTED" : "WALLET_RESPONSE_LOST");
        }
        if (typeof hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(hash)) await unknownOutcome("LOST", "WALLET_RESPONSE_LOST");
        this.assert(c);
        return this.adopt(c,await this.call(c,"bot_account_attach_tx",{p_operation_id:id,p_tx_hash:hash.toLowerCase()}));
      });
    }
    async openOperation(id) {
      return this.run(async c => { if (!UUID.test(id)) fail("INVALID_OPERATION"); return this.adopt(c,await this.call(c,"bot_account_operation",{p_operation_id:id})); });
    }
    async openWallet() {
      // Сбой загрузки/создания модуля MetaMask — отдельная причина с подробностью, а не «источник недоступен».
      this._step = "wallet";
      try { return await this.wallet(); }
      catch (e) { if (e && (e.code === 4001 || e.code === "ACTION_REJECTED")) throw e; throw new ClientError("WALLET_UNAVAILABLE", e && e.message); }
    }
    async checkedWallet(c, expected) {
      const provider = await this.openWallet(); this.assert(c);
      const accounts = await provider.request({method:"eth_requestAccounts"}); this.assert(c);
      if (!Array.isArray(accounts) || address(accounts[0]) !== address(expected)) fail("WALLET_CHANGED");
      let chain = await provider.request({method:"eth_chainId"}); this.assert(c);
      if (BigInt(chain) !== 137n) {
        await provider.request({method:"wallet_switchEthereumChain",params:[{chainId:"0x89"}]}); this.assert(c);
        chain = await provider.request({method:"eth_chainId"}); this.assert(c);
      }
      if (BigInt(chain) !== 137n) fail("WRONG_CHAIN");
      return provider;
    }
    async signTransfer(accepted) {
      return this.run(async c => {
        if (accepted !== true) fail("TRANSFER_ACCEPT_REQUIRED");
        const a = accountCheck(this.state.account), reviewed=this.state.operation, operationId = reviewed && reviewed.operation_id;
        if (!reviewed || reviewed.state !== "AWAITING_SIGNATURE") fail("NOT_READY_TO_SIGN");
        if (reviewed.fee_units == null) fail("FEES_UNVERIFIED");
        integer(reviewed.fee_units);
        // Re-read immutable intent and status immediately before any wallet request.
        const r = await this.call(c,"bot_account_operation",{p_operation_id:operationId});
        const o = r.operation, td = validateTransfer(o,a,this.now());
        if (o.operation_id !== operationId || JSON.stringify(o.intent)!==JSON.stringify(reviewed.intent) || JSON.stringify(o.challenge)!==JSON.stringify(reviewed.challenge) || o.fee_units!==reviewed.fee_units) fail("OPERATION_MISMATCH");
        this.adopt(c,r);
        const provider = await this.checkedWallet(c,a.verified_user_signer);
        validateTransfer(o,a,this.now()); this.assert(c);
        const signature = await provider.request({method:"eth_signTypedData_v4",params:[a.verified_user_signer,JSON.stringify(td)]});
        this.assert(c);
        const selected = await provider.request({method:"eth_accounts"}); this.assert(c);
        if (!Array.isArray(selected) || address(selected[0]) !== address(a.verified_user_signer) || BigInt(await provider.request({method:"eth_chainId"})) !== 137n) fail("WALLET_CHANGED");
        this.assert(c); validateTransfer(o,a,this.now());
        if (typeof signature !== "string" || !/^0x[0-9a-f]{130}$/i.test(signature)) fail("INVALID_SIGNATURE");
        try {
          return this.adopt(c,await this.call(c,"bot_account_submit_transfer",{p_operation_id:operationId,p_signature:signature}));
        } catch(e) {
          if(this.alive(c))this.paint(c,{operation:{...o,state:"UNKNOWN",challenge:null,reason:"SUBMIT_OUTCOME_UNCONFIRMED"}});
          throw e;
        }
      });
    }
    async connect() {
      return this.run(async c => {
        const provider = await this.openWallet(); this.assert(c);
        const selected = await provider.request({method:"eth_requestAccounts"}); this.assert(c);
        const signer = address(selected && selected[0]);
        const owned = await this.call(c,"wallet_link_status",{},true);
        if (owned && owned.state === "OWNED" && address(owned.signer) === signer) return this.adopt(c,await this.call(c,"bot_account_get"));
        if (owned && ["PENDING","VERIFYING"].includes(owned.state)) {this.paint(c,{status:"OWNERSHIP_PENDING"});return owned;}
        const view = await this.resolveWallet(signer); this.assert(c);
        if (!view || view.status !== "ok") fail("POLYMARKET_ACCOUNT_NOT_FOUND");
        const target = address(view.proxy);
        const saved = await this.call(c,"set_wallet_view",{p_input_address:signer,p_resolved_address:target,p_profile_name:view.name || "",p_source:"gamma-public-profile"},true);
        if (!saved || address(saved.resolved_address) !== target) fail("WALLET_VIEW_NOT_SAVED");
        const challenge = await this.call(c,"wallet_link_challenge",{p_signer:signer},true);
        if (!challenge || challenge.status !== "CHALLENGE") fail("WALLET_CHALLENGE_UNAVAILABLE");
        const td = challenge.typed_data, m = td && td.message;
        if (!td || td.primaryType !== "WalletLink" || td.domain.name !== "AI Sports (official)" || td.domain.version !== "1" || Number(td.domain.chainId) !== CHAIN ||
            !m || address(m.signer) !== signer || address(m.tradingAccount) !== target || m.nonce !== challenge.nonce || !/^[0-9]+$/.test(String(m.telegramUserId)) ||
            Number(m.expiresAt)*1000 <= this.now() || Number(m.expiresAt)*1000 > this.now()+6*60000 ||
            m.app !== "AI Sports official — @aisports0bot" || m.network !== "Polygon (chainId 137)" ||
            m.purpose !== "Только подтверждение контроля кошелька и привязка для просмотра в AI Sports. НЕ разрешает торговлю, переводы, approve и расходование средств.") fail("UNSAFE_SIGNATURE");
        exactKeys(td.domain,["name","version","chainId"]);
        exactKeys(m,["purpose","app","network","tradingAccount","signer","telegramUserId","nonce","issuedAt","expiresAt"]);
        const wltypes={WalletLink:[{name:"purpose",type:"string"},{name:"app",type:"string"},{name:"network",type:"string"},{name:"tradingAccount",type:"address"},{name:"signer",type:"address"},{name:"telegramUserId",type:"uint256"},{name:"nonce",type:"bytes32"},{name:"issuedAt",type:"uint256"},{name:"expiresAt",type:"uint256"}]};
        const supplied={...td.types};delete supplied.EIP712Domain;
        if(JSON.stringify(supplied)!==JSON.stringify(wltypes))fail("UNSAFE_SIGNATURE");
        exactKeys(td,["types","primaryType","domain","message"]);
        if(td.types.EIP712Domain&&JSON.stringify(td.types.EIP712Domain)!==JSON.stringify([{name:"name",type:"string"},{name:"version",type:"string"},{name:"chainId",type:"uint256"}]))fail("UNSAFE_SIGNATURE");
        await this.checkedWallet(c,signer); this.assert(c);
        const signature = await provider.request({method:"eth_signTypedData_v4",params:[signer,JSON.stringify(td)]}); this.assert(c);
        const after = await provider.request({method:"eth_accounts"}); this.assert(c);
        if (address(after && after[0]) !== signer || BigInt(await provider.request({method:"eth_chainId"})) !== 137n) fail("WALLET_CHANGED");
        this.assert(c);
        if (typeof signature!=="string"||!/^0x[0-9a-f]{130}$/i.test(signature)||Number(m.expiresAt)*1000<=this.now()) fail("INVALID_SIGNATURE");
        const submitted = await this.call(c,"wallet_link_submit",{p_nonce:challenge.nonce,p_signature:signature},true);
        if (!submitted || !["PENDING","SUBMITTED"].includes(submitted.status)) fail("OWNERSHIP_REJECTED");
        this.paint(c,{status:"OWNERSHIP_PENDING"});
        return submitted;
      });
    }
  }

  const copy = {
    title:["Торговый счёт AISports","AISports trading account","AISports 交易账户"],
    custody:["Это отдельный счёт для автоматической торговли. Его полный ключ хранит сервис: он может ставить и переводить деньги этого счёта. Основной ключ вашего кошелька не передаётся. При компрометации сервера средства этого отдельного счёта могут быть потеряны.","This separate account is controlled by a key held by the service, including trading and transfers. Your main wallet key is never shared. A compromised server could put this account’s funds at risk.","这是独立的自动交易账户。服务保管其完整密钥，可交易及转账。不会获取您的主钱包密钥。服务器被攻破可能导致该账户资金损失。"],
    custodyAccept:["Понимаю, кто хранит ключ отдельного счёта","I understand who controls this account’s key","我了解此账户密钥的保管方式"],
    custodyShort:["Ключ счёта AISports хранит сервис; ваш MetaMask сам по себе этот отдельный счёт не восстановит. Не держите здесь сумму, потерю которой не можете позволить.","The service holds the AISports account key; your MetaMask alone cannot restore this separate account. Do not keep more here than you can afford to lose.","AISports 账户密钥由服务保管；仅凭您的 MetaMask 无法恢复此独立账户。请勿存放您无法承受损失的金额。"],
    create:["Создать торговый счёт","Create trading account","创建交易账户"], retryCreate:["Повторить создание","Retry account creation","重试创建账户"], connect:["Подключить MetaMask","Connect MetaMask","连接 MetaMask"],
    connectHint:["В браузере подключится расширение MetaMask. В Telegram на компьютере используйте QR для MetaMask на телефоне; расширение Chrome внутри Telegram недоступно. На телефоне подтвердите подключение в приложении MetaMask и вернитесь сюда.","A browser can connect to the MetaMask extension. In desktop Telegram, use the QR code with MetaMask on your phone; Chrome extensions are unavailable inside Telegram. On mobile, approve in MetaMask and return here.","浏览器可连接 MetaMask 扩展。桌面 Telegram 请用手机 MetaMask 扫描二维码，Telegram 内不能使用 Chrome 扩展。手机上请在 MetaMask 确认后返回。"],
    refresh:["Обновить","Refresh","刷新"], fund:["Пополнить","Add funds","充值"], withdraw:["Вывести","Withdraw","提现"],
    settings:["Настройки","Settings","设置"], close:["Закрыть","Close","关闭"], stop:["Остановить новые ставки","Stop new bets","停止新投注"], enable:["Включить автоставки","Enable auto-bets","启用自动投注"],
    transferStepAmount:["Шаг 1 · Сумма","Step 1 · Amount","第 1 步 · 金额"], transferStepReview:["Шаг 2 · Проверка","Step 2 · Review","第 2 步 · 核对"],
    transferStepStatus:["Статус перевода","Transfer status","转账状态"], transferOpen:["Открыть","Open","打开"],
    amount:["Сумма pUSD","Amount in pUSD","pUSD 金额"], prepare:["Проверить перевод","Review transfer","检查转账"], sign:["Подтвердить в кошельке","Confirm in wallet","在钱包中确认"],
    transferAccept:["Проверил сумму и оба счёта. Подпись разрешает движение денег.","I checked the amount and both accounts. This signature authorizes moving funds.","我已核对金额与两个账户，此签名授权资金转移。"],
    transferSigning:["Вы подписываете сообщение. Сетевую транзакцию отправляет сервис.","You sign a message. The service submits the network transaction.","您签署消息，由服务提交链上交易。"],
    available:["Свободно","Available","可用"], reserved:["Зарезервировано","Reserved","预留"], positions:["Стоимость открытых позиций","Open position value","未平仓持仓价值"], pnl:["Подтверждённый результат","Realized result","已实现盈亏"],
    source:["Откуда","From","来源"], recipient:["Куда","To","目标"], fees:["Комиссия","Fee","费用"], unverifiedFee:["Уточняется — будет показана до подписи","Pending — shown before signing","待确认，将在签名前显示"],
    history:["Мои операции и ставки","My transactions and bets","我的交易与投注"], empty:["Операций пока нет","No transactions yet","暂无交易"],
    maxStake:["Максимум одной ставки, % свободного банка (не более 10)","Maximum stake, % of available funds (up to 10)","单注上限：可用资金百分比（不超过10）"],
    stakeLimit:["Лимит одной ставки","Stake limit","单注上限"],
    save:["Сохранить настройки","Save settings","保存设置"], policyAccept:["Принимаю показанное правило ставок","I accept this betting policy","我接受此投注规则"],
    autoSwitch:["Автоставки","Auto-bets","自动投注"],
    autoOn:["включены","on","已开启"], autoOff:["выключены","off","已关闭"],
    autoNeedFunds:["Пополните счёт, чтобы включить","Add funds to enable","请先充值再启用"],
    autoNeedReady:["Счёт ещё готовится","The account is still being prepared","账户仍在准备中"],
    autoBusyOp:["Дождитесь завершения операции","Wait until the operation finishes","请等待操作完成"],
    autoConfirm:["Включить автоставки","Enable auto-bets","启用自动投注"],
    fundedOk:["Счёт пополнен","Account funded","账户已充值"],
    noMoneyMoved:["деньги не списаны","no funds were moved","未扣款"],
    policy:["MLB. Меньшая из доли стратегии и вашего максимума; комиссия входит в риск. Максимум открытых позиций:","MLB. The lower of the strategy allocation and your maximum; fees count toward risk. Maximum open positions:","MLB。采用策略比例和您上限中的较低值，费用计入风险。最大未平仓数量："],
    stopInfo:["Остановка запрещает новые ставки. Отправленные заявки и переводы продолжают сверяться, открытые позиции сохраняются.","Stopping prevents new bets. Submitted orders and transfers continue to reconcile; positions remain open.","停止后不再新增投注，已发送的订单与转账继续核对，现有持仓保留。"],
    separate:["Личный счёт Polymarket остаётся отдельным. Прежние деньги сюда автоматически не переносятся.","Your personal Polymarket account remains separate. Existing funds are not moved automatically.","您的个人 Polymarket 账户保持独立，现有资金不会自动转入。"],
    checked:["Последняя сверка","Last checked","上次核对"], details:["Подробности","Details","详情"], waiting:["Проверяем состояние…","Checking status…","正在检查状态…"],
    checkingHint:["Сервис читает остаток в сети Polygon и готовит перевод к подписи — обычно до 30 секунд. Экран обновится сам.","The service reads the on-chain balance and prepares the transfer for signing — usually within 30 seconds. This screen updates by itself.","服务正在读取链上余额并准备待签名的转账，通常不超过 30 秒。页面会自动更新。"],
    srcPolymarket:["Со счёта Polymarket","From Polymarket account","从 Polymarket 账户"], srcMetaMask:["Из MetaMask","From MetaMask","从 MetaMask"],
    srcChoose:["Откуда пополнить","Fund from","充值来源"], balanceSrc:["Баланс","Balance","余额"], heldSrc:["Удержано","Held","已冻结"],
    availableSrc:["Доступно","Available","可用"], gasSrc:["Газ, POL","Gas, POL","Gas (POL)"], blockSrc:["блок","block","区块"],
    srcUnchecked:["Остаток ещё не проверен сервисом — перевод недоступен","Not yet checked by the service — transfer unavailable","服务尚未核对余额，暂不可转账"],
    srcStale:["Проверка устарела — дождитесь новой","Check is out of date — wait for a new one","核对已过期，请等待更新"],
    srcNoPusd:["На MetaMask нет pUSD в Polygon. Выберите счёт Polymarket или пополните MetaMask именно pUSD.","No pUSD on Polygon in MetaMask. Choose the Polymarket account or add pUSD to MetaMask.","MetaMask 在 Polygon 上没有 pUSD。请选择 Polymarket 账户或向 MetaMask 充入 pUSD。"],
    srcNoGas:["Нет POL на оплату сетевой комиссии","No POL to pay the network fee","没有支付网络费用的 POL"],
    srcOwner:["Счёт Polymarket не подтверждён в сети","Polymarket account not confirmed on-chain","Polymarket 账户未在链上确认"],
    maxAmount:["Максимум сейчас","Maximum now","当前上限"],
    actionType:["Действие","Action","操作"], actionSign:["Подпись сообщения для Polymarket","Message signature for Polymarket","为 Polymarket 签署消息"],
    actionTx:["Сетевая транзакция из MetaMask","Network transaction from MetaMask","从 MetaMask 发起链上交易"],
    gasFee:["Газ в POL с вашего адреса — точную сумму покажет MetaMask","Gas in POL from your address — MetaMask shows the exact amount","由您的地址支付 POL gas，具体金额由 MetaMask 显示"],
    txSending:["Вы отправляете перевод pUSD со своего адреса MetaMask. Разрешение approve не запрашивается.","You send a pUSD transfer from your MetaMask address. No approve is requested.","您从 MetaMask 地址发送 pUSD 转账，不请求 approve。"],
    sendTx:["Отправить из MetaMask","Send from MetaMask","从 MetaMask 发送"], cancel:["Отменить перевод","Cancel transfer","取消转账"],
    failedFunding:["Пополнение {a} pUSD не выполнено.","Funding of {a} pUSD was not completed.","{a} pUSD 充值未完成。"],
    srcAtCheck:["На исходном кошельке {b} pUSD на момент проверки {t}.","The source wallet held {b} pUSD at the check {t}.","核对时（{t}）来源钱包余额为 {b} pUSD。"],
    srcAtCheckNone:["Остаток исходного кошелька сейчас не подтверждён.","The source wallet balance is not confirmed right now.","来源钱包余额暂未确认。"],
    notDebited:["Деньги не списаны. Выберите меньшую сумму или пополните исходный кошелёк.","No funds were debited. Choose a smaller amount or top up the source wallet.","未扣款。请选择较小金额或为来源钱包充值。"],
    shortfall:["Недостаточно pUSD на исходном кошельке: доступно {v}, нужно {n}. Перевод не отправлен, деньги не списаны.","Not enough pUSD in the source wallet: {v} available, {n} needed. Nothing was sent; no funds moved.","来源钱包 pUSD 不足：可用 {v}，需要 {n}。未发送，未扣款。"]
  };
  const states = {
    SIGNED_OUT:["Откройте приложение из Telegram","Open the app from Telegram","请从 Telegram 打开应用"],
    NOT_CONNECTED:["Подтвердите личный кошелёк","Verify your personal wallet","请验证个人钱包"], NOT_CREATED:["Отдельный счёт ещё не создан","Separate account not created","尚未创建独立账户"],
    OWNERSHIP_PENDING:["Проверяем владение кошельком","Verifying wallet ownership","正在验证钱包所有权"],
    CREATING:["Создаём счёт","Creating account","正在创建账户"], PROVISIONING:["Создаём счёт","Creating account","正在创建账户"],
    ERROR:["Счёт не создан","Account not created","账户未创建"],
    READY:["Готов к включению","Ready to enable","可以启用"], NEEDS_FUNDING:["Нужно пополнение","Funding required","需要充值"],
    PREPARING:["Подготовка торговли","Preparing trading","准备交易中"], ACTIVE:["Автоставки включены","Auto-bets enabled","自动投注已启用"],
    STALE:["Нет свежей проверки — состояние торговли уточняется","No recent check — trading status is uncertain","缺少最近检查，交易状态待确认"],
    ACTIVE_NO_SIGNAL:["Автоставки включены — подходящих прогнозов пока нет","Auto-bets enabled — no qualifying signals yet","自动投注已启用，暂时没有合适信号"],
    STOPPED:["Новые ставки остановлены","New bets stopped","新投注已停止"], AWAITING_SIGNATURE:["Перевод готов к подтверждению","Transfer ready for your confirmation","转账已准备，请确认"],
    PENDING:["Операция обрабатывается","Processing transaction","正在处理交易"], UNKNOWN:["Исход уточняется — повторный перевод не отправляется","Outcome unknown — no duplicate transfer will be sent","结果待核对，不会重复转账"],
    SUBMITTED:["Отправлено — ожидаем подтверждения","Submitted — awaiting confirmation","已提交，等待确认"], CONFIRMED:["Подтверждено","Confirmed","已确认"],
    CHECKING:["Проверяем баланс источника","Checking the source balance","正在核对来源余额"],
    AWAITING_WALLET_TX:["Перевод готов — подтвердите в MetaMask","Transfer ready — confirm in MetaMask","转账已准备，请在 MetaMask 中确认"],
    WALLET_PENDING:["Ждём подтверждения в кошельке","Waiting for confirmation in the wallet","等待钱包确认"],
    REJECTED_NO_DEBIT:["Не выполнено — деньги не списаны","Not completed — no funds were debited","未完成，未扣款"],
    EXPIRED_UNSENT:["Отклонено до отправки","Rejected before sending","发送前被拒绝"],
    FAILED:["Операция не выполнена","Transaction failed","交易失败"], REJECTED:["Операция отклонена","Transaction rejected","交易被拒绝"], CANCELLED:["Операция отменена","Transaction cancelled","交易已取消"], EXPIRED:["Срок подтверждения истёк","Confirmation expired","确认已过期"]
  };
  const errors = {
    GEOBLOCKED:["Торговля недоступна в вашем регионе. Автоставки не включены.","Trading is unavailable in your region. Auto-bets were not enabled.","您所在地区不支持交易，未启用自动投注。"],
    GEOBLOCK_UNVERIFIED:["Не удалось проверить доступность торговли в вашем регионе. Включение остановлено.","Could not verify trading availability in your region. Enabling was stopped.","无法核实您所在地区是否允许交易，已停止启用操作。"],
    NOT_READY:["Счёт или исполнитель ещё не готовы. Обновите состояние.","The account or execution service is not ready. Refresh status.","账户或交易服务尚未就绪，请刷新。"],
    VERSION_CONFLICT:["Настройки изменились на другом устройстве. Обновите и проверьте их.","Settings changed on another device. Refresh and review them.","设置已在其他设备修改，请刷新并检查。"],
    BALANCE_STALE:["Нужна свежая сверка баланса. Ожидаем подтверждения.","A fresh balance check is required. Awaiting confirmation.","需要重新核对余额，正在等待确认。"],
    NEED_FUNDING:["Пополните отдельный счёт перед включением.","Fund the separate account before enabling trading.","请先向独立账户充值再启用交易。"],
    SIGNATURE_EXPIRED:["Срок подтверждения истёк. Обновите состояние операции.","The confirmation expired. Refresh the transaction status.","确认已过期，请刷新交易状态。"],
    SOURCE_UNAVAILABLE:["Источник недоступен. Обновите состояние перед новым действием.","Service unavailable. Refresh before trying another action.","服务不可用，请刷新状态后重试。"],
    VERSION_MISMATCH:["Версии приложения и сервера различаются. Обновите приложение.","App and server versions differ. Reload the app.","应用和服务器版本不兼容，请重新加载。"],
    WALLET_REJECTED:["Кошелёк отменил действие. Перевод не отправлен этим запросом.","Wallet confirmation cancelled. This request did not submit a transfer.","钱包确认已取消，此请求未提交转账。"],
    WALLET_CHANGED:["В кошельке выбран другой аккаунт. Верните подтверждённый адрес.","A different wallet account is selected. Select the verified address.","当前钱包账户不一致，请选择已验证地址。"],
    INVALID_AMOUNT:["Укажите положительную сумму, не более 6 знаков после точки.","Enter a positive amount with at most 6 decimal places.","请输入正数金额，小数不超过6位。"],
    INSUFFICIENT_BALANCE:["Недостаточно pUSD на исходном счёте: перевод не отправлен, деньги не списаны. Выберите сумму не больше доступной.","Not enough pUSD on the source account: the transfer was not sent and no funds moved. Choose an amount within the available balance.","源账户 pUSD 不足：未发送转账，未扣款。请选择不超过可用余额的金额。"],
    INSUFFICIENT_AVAILABLE:["Недостаточно подтверждённых свободных средств.","Insufficient confirmed available funds.","已确认可用资金不足。"],
    INVALID_POLICY:["Максимум ставки должен быть больше 0 и не выше 10%.","Stake maximum must be above 0 and no more than 10%.","单注上限必须大于0且不超过10%。"],
    WALLET_UNAVAILABLE:["Откройте приложение в поддерживаемом кошельке или подключите MetaMask. Данные Telegram в ссылку не передаются.","Connect MetaMask in a supported browser. Telegram data is never copied into a link.","请在支持的浏览器连接 MetaMask，Telegram 数据不会传入链接。"],
    OPERATION_IN_PROGRESS:["Сначала уточните исход текущей операции.","Resolve the current transaction before starting another.","请先核对当前交易结果。"],
    FEES_UNVERIFIED:["Комиссия пока не подтверждена. Подпись недоступна.","The fee is not confirmed yet. Signing is unavailable.","费用尚未确认，暂不能签名。"],
    SOURCE_HTTP:["База ответила ошибкой — у поставщика базы (Supabase) сбой. Ничего не отправлялось; повторите через минуту.","The database answered with an error — the database provider (Supabase) is having an incident. Nothing was sent; retry in a minute.","数据库返回错误——数据库服务商 (Supabase) 出现故障。未发送任何内容，请一分钟后重试。"],
    SOURCE_TIMEOUT:["Сервер не ответил вовремя. Обновите состояние — повторно ничего не отправлялось.","The server did not answer in time. Refresh the status — nothing was re-sent.","服务器未及时响应。请刷新状态，未重复发送任何内容。"],
    SOURCE_REQUIRED:["Выберите, откуда пополнить: Polymarket или MetaMask.","Choose where to fund from: Polymarket or MetaMask.","请选择充值来源：Polymarket 或 MetaMask。"],
    BALANCE_UNAVAILABLE:["Нет свежей проверки остатка источника. Перевод не создан; обновите через минуту.","No fresh check of the source balance. Nothing was created; refresh in a minute.","来源余额缺少最新核对，未创建转账，请一分钟后刷新。"],
    GAS_UNAVAILABLE:["На адресе MetaMask нет POL для сетевой комиссии. Перевод не создан.","No POL for the network fee on the MetaMask address. Nothing was created.","MetaMask 地址没有支付网络费用的 POL，未创建转账。"],
    SOURCE_OWNER_MISMATCH:["Счёт Polymarket не подтверждён в сети для вашего адреса. Перевод не создан.","The Polymarket account is not confirmed on-chain for your address. Nothing was created.","您的 Polymarket 账户未在链上确认，未创建转账。"],
    NOT_SENT_CHAIN_MISMATCH:["В MetaMask выбрана не сеть Polygon. Перевод не отправлен, деньги не списаны.","MetaMask is not on Polygon. Nothing was sent; no funds moved.","MetaMask 未选择 Polygon 网络。未发送，未扣款。"],
    NOT_SENT_BALANCE_LOW:["В MetaMask не хватает pUSD. Перевод не отправлен, деньги не списаны.","Not enough pUSD in MetaMask. Nothing was sent; no funds moved.","MetaMask 中 pUSD 不足。未发送，未扣款。"],
    NOT_SENT_GAS_LOW:["Не хватает POL на сетевую комиссию. Перевод не отправлен, деньги не списаны.","Not enough POL for the network fee. Nothing was sent; no funds moved.","POL 不足以支付网络费用。未发送，未扣款。"],
    WALLET_DECLINE_REPORTED:["Кошелёк сообщил об отказе. Сверяем сеть; повторный перевод не отправляется, сумма удержана до сверки.","The wallet reported a decline. Checking the chain; nothing will be re-sent and the amount stays held until then.","钱包报告已拒绝。正在核对链上记录，不会重复发送，金额在核对前保持冻结。"],
    WALLET_OUTCOME_UNRECORDED:["Исход перевода не удалось записать на сервер. Операция остаётся в сверке: повторный перевод не отправляется, сумма удержана до ответа сети.","The transfer outcome could not be recorded on the server. The operation stays under reconciliation: nothing will be re-sent and the amount stays held until the network answers.","无法将转账结果记录到服务器。该操作仍在核对中：不会重复发送，金额在网络确认前保持冻结。"],
    WALLET_RESPONSE_LOST:["Ответ кошелька не получен. Сверяем сеть; повторный перевод не отправляется.","No reply from the wallet. Checking the chain; nothing will be re-sent.","未收到钱包回复。正在核对链上记录，不会重复发送。"],
    UNSAFE_TRANSACTION:["Параметры перевода не совпали с проверенными. Кошелёк не открывался.","Transfer details did not match the verified ones. The wallet was not opened.","转账参数与已核对内容不符，未打开钱包。"],
    WALLET_NOT_STARTED:["Сервер не подтвердил начало перевода. Кошелёк не открывался.","The server did not confirm the start. The wallet was not opened.","服务器未确认开始，未打开钱包。"]
  };
  const kinds={FUNDING:["Пополнение","Funding","充值"],WITHDRAW:["Вывод","Withdrawal","提现"],PROVISION:["Создание счёта","Account creation","创建账户"],APPROVE:["Подготовка торговли","Trading preparation","交易准备"],TRADE:["Ставка","Bet","投注"],CLAIM:["Получение выплаты","Payout","领取收益"]};
  const reasons={
    USER_STOP:["Вы остановили новые ставки","You stopped new bets","您已停止新投注"],
    WITHDRAW_PENDING:["Новые ставки приостановлены для вывода","New bets paused for withdrawal","提现期间暂停新投注"],
    POLICY_CHANGED:["Новые настройки сохранены. Примите их для включения.","Settings saved. Accept them to enable trading.","设置已保存，接受后即可启用交易。"],
    NO_AVAILABLE_BANK:["Нет свободных средств","No available funds","无可用资金"],
    MIN_LOT:["Маленькая сумма для минимальной ставки","Amount below the minimum bet","金额低于最低投注"],
    MIN_ORDER_UNMET:["Маленькая сумма для минимальной ставки","Amount below the minimum bet","金额低于最低投注"],
    PRICE_CHANGED:["Цена изменилась","Price changed","价格已变化"],
    PRICE_RANGE:["Цена изменилась","Price changed","价格已变化"],
    LOW_EV:["Не прошёл отбор стратегии","Did not meet the strategy criteria","未满足策略筛选条件"],
    QUALITY_GATE:["Не прошёл отбор стратегии","Did not meet the strategy criteria","未满足策略筛选条件"],
    SIGNAL_EXPIRED:["Срок прогноза истёк","Signal expired","预测已过期"],
    BOOK_STALE:["Данные цены устарели","Price data is stale","价格数据已过期"],
    INVALID_SIGNAL_OR_QUOTE:["Источник не подтвердил данные","Source data could not be verified","无法核实来源数据"],
    QUOTE_REJECTED:["Площадка не подтвердила доступную цену","The venue did not confirm an available price","平台未确认可用价格"],
    MATCH_STARTED:["Матч уже начался","Match already started","比赛已开始"],
    CHECK_FAILED:["Источник недоступен — проверка не завершена","Source unavailable — check incomplete","来源不可用，检查未完成"],
    ACCOUNT_BALANCE_UNPROVEN:["Баланс ещё не подтверждён","Balance not yet confirmed","余额尚未确认"],
    PROVIDER_ACCESS_DENIED:["Polymarket не разрешил приложению создать торговый счёт. Деньги не переводились.","Polymarket did not allow the app to create the trading account. No funds were moved.","Polymarket 未允许应用创建交易账户，资金未转移。"],
    INSUFFICIENT_BALANCE:["Недостаточно pUSD на исходном кошельке","Not enough pUSD in the source wallet","来源钱包 pUSD 不足"],
    BALANCE_UNAVAILABLE:["Остаток источника не удалось проверить","The source balance could not be checked","无法核对来源余额"],
    GAS_UNAVAILABLE:["Нет POL на сетевую комиссию","No POL for the network fee","没有网络费用 POL"],
    BATCH_EXPIRED:["Подпись не была готова до истечения срока; перевод не отправлен","The signing window expired before the transfer was sent","签名准备超时，转账未发送"],
    EXPIRED_UNSENT:["Срок подтверждения истёк до отправки","Expired before it was sent","发送前已过期"],
    WALLET_PENDING:["Ждём подтверждения в кошельке","Waiting for the wallet","等待钱包确认"],
    SENT_AWAITING_CHAIN:["Отправлено — ждём сеть","Sent — waiting for the network","已发送，等待网络确认"],
    WALLET_OUTCOME_UNRECORDED:["Исход не записан на сервер — сверка продолжается, повтор не отправляем","Outcome not recorded on the server — reconciliation continues, nothing re-sent","结果未记录到服务器，核对继续，不重复发送"],
    WALLET_RESPONSE_LOST:["Ответ кошелька не получен — сверяем сеть, повтор не отправляем","No wallet reply — checking the chain, nothing re-sent","未收到钱包回复，正在核对链上记录，不重复发送"],
    WALLET_DECLINE_REPORTED:["Кошелёк сообщил об отказе — сверяем сеть, повтор не отправляем","Wallet reported a decline — checking the chain, nothing re-sent","钱包报告拒绝，正在核对链上记录，不重复发送"],
    NOT_SENT_CANCELLED:["Отменено до отправки","Cancelled before sending","发送前已取消"],
    NOT_SENT_CHAIN_MISMATCH:["Не та сеть в MetaMask — не отправлено","Wrong network in MetaMask — not sent","MetaMask 网络错误，未发送"],
    NOT_SENT_BALANCE_LOW:["Не хватило pUSD в MetaMask — не отправлено","Not enough pUSD in MetaMask — not sent","MetaMask pUSD 不足，未发送"],
    NOT_SENT_GAS_LOW:["Не хватило POL на газ — не отправлено","Not enough POL for gas — not sent","POL 不足，未发送"]
  };
  function textFor(table,key,lang) { const x=table[key]; return x ? x[{ru:0,en:1,zh:2}[lang] || 0] : key; }
  function opStateKey(o) {
    if (o && o.kind === "FUNDING") {
      if (o.state === "PENDING" || o.state === "CLAIMED") return "CHECKING";
      if (o.state === "AWAITING_SIGNATURE" && o.source_kind === "METAMASK") return "AWAITING_WALLET_TX";
      if (o.state === "REJECTED") return "REJECTED_NO_DEBIT";   // SQL releases a funding only with proof of no debit
    }
    return o ? o.state : null;
  }
  // Owner 25.09: while the service prepares the transfer, show how long we have been waiting (usually ≤30 s).
  function waitingLabel(o, lang, now = Date.now()) {
    if (!o || opStateKey(o) !== "CHECKING" || !o.created_at) return "";
    const sec = Math.max(0, Math.round((now - Date.parse(o.created_at)) / 1000));
    return " · " + (lang === "ru" ? sec + " с" : lang === "zh" ? sec + " 秒" : sec + " s");
  }
  function formatPol(wei) {
    if (!/^[0-9]+$/.test(String(wei))) return "—";
    const t = BigInt(wei) / 10n ** 14n; return (t / 10000n).toString() + "." + (t % 10000n).toString().padStart(4, "0");
  }
  function stateLabel(s,now=Date.now()) {
    const a=s.account;
    if (!a) return s.status;
    if (["CREATING","PROVISIONING"].includes(a.state)) return a.state;
    if (a.policy && a.policy.enabled && (s.error || !a.runtime_expires_at || !Number.isFinite(Date.parse(a.runtime_expires_at)) || Date.parse(a.runtime_expires_at)<=now)) return "STALE";
    if (a.policy && a.policy.enabled && a.runtime_ready === true && a.state === "READY") return a.reason === "NO_SIGNAL" ? "ACTIVE_NO_SIGNAL" : "ACTIVE";
    if (a.policy && a.policy.enabled) return "PREPARING";
    if (a.reason === "USER_STOP" || a.state === "STOPPED") return "STOPPED";
    if (a.state === "READY" && a.balance && a.balance.available_units === "0") return "NEEDS_FUNDING";
    return a.state;
  }
  function mount({root,controller,lang="ru"}) {
    const doc=root.ownerDocument, tr=k=>textFor(copy,k,lang), stateText=k=>textFor(states,k,lang),reasonText=k=>textFor(reasons,k,lang),kindText=k=>textFor(kinds,k,lang);
    let transferKind=null, transferDialog=null, inputAmount="", settingsDialog=null, enableOpen=false, lastAccount=null, lastAvailable=null, fundingSource="POLYMARKET", sourceMenuOpen=false, walletsOpen=false, checksOpen=false, pollTimer=null;
    const fill=(text,vars)=>text.replace(/\{(\w)\}/g,(_,k)=>vars[k]??"—");
    function ensureStyles() {
      // Оформление блока живёт здесь, чтобы модуль оставался самодостаточным. Только токены витрины:
      // Inter с табличными цифрами, шаг отступов 4, радиусы --r-*, поверхности --card-*, волосяные --line.
      if (doc.getElementById("ba-style")) return;
      const st=doc.createElement("style"); st.id="ba-style";
      st.textContent=`
.ba-head{display:flex;align-items:center;justify-content:space-between;gap:var(--s2,8px)}
.ba-pill{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.06em;
  text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--card-3,#212b3d);color:var(--txt-2,#b8c4d6);white-space:nowrap}
.ba-pill.on{background:color-mix(in srgb,var(--green,#22c55e) 18%,transparent);color:var(--green,#22c55e)}
.ba-pill.warn{background:color-mix(in srgb,var(--amber,#f59e0b) 18%,transparent);color:var(--amber,#f59e0b)}
.ba-pill.bad{background:color-mix(in srgb,var(--red,#f43f5e) 18%,transparent);color:var(--red,#f43f5e)}
.ba-pill i{width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block}
.ba-pill.live i{animation:ba-pulse 1.4s ease-in-out infinite}
@keyframes ba-pulse{0%,100%{opacity:.35;transform:scale(.8)}50%{opacity:1;transform:scale(1.25)}}
.ba-amount{font-size:34px;font-weight:750;letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1.05;
  margin:var(--s3,12px) 0 2px}
.ba-amount span{font-size:16px;font-weight:650;letter-spacing:-.01em;color:var(--mut,#7d8eaa);margin-left:2px}
.ba-amount.up{animation:ba-up .6s cubic-bezier(.2,.9,.2,1)}
@keyframes ba-up{0%{transform:translateY(6px) scale(.98);opacity:.4;color:var(--green,#22c55e)}60%{color:var(--green,#22c55e)}100%{transform:none;opacity:1}}
.ba-cap{font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mut,#7d8eaa)}
.ba-rows{margin-top:var(--s3,12px);border-top:1px solid var(--line,rgba(255,255,255,.07))}
.ba-row{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px);
  padding:9px 0;border-bottom:1px solid var(--line,rgba(255,255,255,.07))}
.ba-row .l{font-size:12px;color:var(--mut,#7d8eaa)}
.ba-row .r{font-size:13.5px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.ba-wal{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px);padding:10px 0;
  border-bottom:1px solid var(--line,rgba(255,255,255,.07))}
.ba-wal .n{font-size:11.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--mut,#7d8eaa)}
.ba-wal .a{font-size:16px;font-weight:650;letter-spacing:.005em;font-variant-numeric:tabular-nums}
.ba-copy{border:0;background:transparent;color:var(--accent,#38bdf8);font:inherit;font-size:12px;font-weight:650;
  padding:4px 6px;border-radius:var(--r-s,10px);cursor:pointer;transition:background .15s,color .15s}
.ba-copy:hover{background:color-mix(in srgb,var(--accent,#38bdf8) 12%,transparent)}
.ba-copy.done{color:var(--green,#22c55e)}
.ba-sw{display:flex;align-items:center;justify-content:space-between;gap:var(--s3,12px);margin-top:var(--s4,16px);
  padding:12px 14px;border:1px solid var(--line,rgba(255,255,255,.07));border-radius:var(--r-l,18px);
  background:var(--card-2,#1a2231);transition:border-color .2s,background .2s}
.ba-sw.on{border-color:color-mix(in srgb,var(--accent,#38bdf8) 45%,transparent);background:var(--tint1,rgba(56,189,248,.12))}
.ba-sw .t{font-size:15px;font-weight:700;letter-spacing:-.015em}
.ba-sw .s{font-size:12px;color:var(--mut,#7d8eaa);margin-top:1px}
.ba-sw.on .s{color:var(--accent,#38bdf8)}
.ba-track{position:relative;flex:0 0 auto;width:52px;height:30px;border-radius:999px;cursor:pointer;
  background:var(--card-3,#212b3d);transition:background .2s}
.ba-track.on{background:var(--accent,#38bdf8)}
.ba-track.off{cursor:not-allowed;opacity:.45}
.ba-track input{position:absolute;inset:0;opacity:0;margin:0;width:100%;height:100%;cursor:inherit}
.ba-knob{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;
  box-shadow:0 1px 3px rgba(0,0,0,.35);transition:left .22s cubic-bezier(.2,.9,.2,1)}
.ba-track.on .ba-knob{left:25px}
.ba-foot{margin-top:10px;font-size:11px;line-height:1.4;color:var(--mut,#7d8eaa);opacity:.75}
.ba-note{margin-top:var(--s3,12px);padding:10px 12px;border-radius:var(--r-m,14px);font-size:12.5px;line-height:1.45}
.ba-note.bad{background:color-mix(in srgb,var(--red,#f43f5e) 12%,transparent);color:var(--red,#f43f5e)}
.ba-note.ok{background:color-mix(in srgb,var(--green,#22c55e) 12%,transparent);color:var(--green,#22c55e);animation:ba-in .35s ease-out}
.ba-note.wait{background:var(--card-2,#1a2231);color:var(--txt-2,#b8c4d6)}
.ba-note b{font-variant-numeric:tabular-nums}
@keyframes ba-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.ba-progress{height:3px;margin-top:10px}
.ba-bar{position:relative;height:3px;border-radius:999px;background:var(--card-3,#212b3d);overflow:hidden}
.ba-bar::after{content:"";position:absolute;inset:0;width:40%;border-radius:999px;
  background:linear-gradient(90deg,transparent,var(--accent,#38bdf8),transparent);animation:ba-slide 1.1s ease-in-out infinite}
@keyframes ba-slide{from{transform:translateX(-100%)}to{transform:translateX(320%)}}
.ba-fold{margin-top:12px;border:1px solid var(--line,rgba(255,255,255,.07));border-radius:var(--r-m,14px);padding:0 12px;background:var(--card-2,#1a2231)}
.ba-fold>summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:12px 0;font-size:13px;font-weight:650}
.ba-fold>summary::-webkit-details-marker{display:none}
.ba-fold>summary::after{content:'⌄';font-size:18px;color:var(--mut,#7d8eaa)}
.ba-fold[open]>summary::after{transform:rotate(180deg)}
.ba-picker{position:relative;margin-top:8px}
.ba-picker-toggle{width:100%;text-align:left;padding:11px 14px;border:1px solid var(--line,rgba(255,255,255,.07));border-radius:var(--r-m,14px);background:var(--card-2,#1a2231);color:inherit;font:inherit;cursor:pointer}
.ba-picker-toggle strong{display:block;font-size:14px}.ba-picker-toggle span{display:block;margin-top:3px;font-size:12px;color:var(--mut,#7d8eaa)}
.ba-picker-menu{margin-top:6px;padding:5px;border:1px solid var(--line,rgba(255,255,255,.07));border-radius:var(--r-m,14px);background:var(--card-3,#212b3d)}
.ba-picker-option{display:block;width:100%;border:0;border-radius:10px;padding:10px;text-align:left;background:transparent;color:inherit;font:inherit;cursor:pointer}
.ba-picker-option[aria-selected=true],.ba-picker-option:hover{background:var(--tint1,rgba(56,189,248,.12))}
.ba-picker-option small{display:block;margin-top:2px;color:var(--mut,#7d8eaa)}
.ba-transfer-dialog{box-sizing:border-box;width:min(420px,calc(100vw - 24px));max-width:none;max-height:min(640px,calc(100dvh - 24px));
  margin:auto;overflow:auto;padding:18px;border:1px solid var(--line,rgba(255,255,255,.1));
  border-radius:var(--r-l,20px);background:var(--card-2,#1a2231);color:var(--txt,#fff);
  box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:inherit}
.ba-transfer-dialog::backdrop{background:rgba(2,8,20,.78);backdrop-filter:blur(9px)}
.ba-transfer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
.ba-transfer-head h3{font-size:21px;line-height:1.15;letter-spacing:-.02em;margin:2px 0 0}
.ba-transfer-step{font-size:11px;color:var(--mut,#7d8eaa);font-weight:650;letter-spacing:.05em;text-transform:uppercase}
.ba-transfer-close{border:1px solid var(--line,rgba(255,255,255,.1));border-radius:50%;background:var(--card-3,#212b3d);
  color:inherit;font:inherit;font-size:19px;line-height:1;width:32px;height:32px;cursor:pointer;flex:0 0 auto}
.ba-transfer-dialog .ba-picker{margin-top:6px}
.ba-transfer-dialog .ba-picker-toggle{padding:12px}
.ba-transfer-input{display:block;margin-top:14px}
.ba-transfer-input .binput{width:100%;box-sizing:border-box;font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;
  margin-top:7px;padding:10px 12px;letter-spacing:-.025em}
.ba-transfer-actions{position:sticky;bottom:-18px;display:flex;gap:8px;background:var(--card-2,#1a2231);
  margin:16px -18px -18px;padding:12px 18px calc(14px + env(safe-area-inset-bottom,0px));
  border-top:1px solid var(--line,rgba(255,255,255,.07))}
.ba-transfer-actions button{margin:0;flex:1}
.ba-transfer-dialog .ba-amount{font-size:32px}
.ba-transfer-dialog .ba-rows{margin-top:12px}
.ba-review-address{font-size:11px;line-height:1.35;overflow-wrap:anywhere;color:var(--txt-2,#b8c4d6);font-variant-numeric:tabular-nums}
.ba-transfer-status{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;
  padding:10px 12px;background:var(--card-2,#1a2231);border-radius:var(--r-m,14px);
  border:1px solid var(--line,rgba(255,255,255,.07));font-size:12px}
.ba-transfer-status button{border:0;background:transparent;color:var(--accent,#38bdf8);font:inherit;font-weight:700;cursor:pointer;white-space:nowrap}
@media(max-width:600px){.ba-transfer-dialog{width:100vw;max-height:calc(100dvh - 16px);margin:auto auto 0;
  border-radius:22px 22px 0 0;border-bottom:0;padding:20px}}
.ba-settings-dialog{width:min(360px,calc(100vw - 32px));max-width:none;padding:20px;border:1px solid var(--line,rgba(255,255,255,.07));border-radius:var(--r-l,18px);background:var(--card-2,#1a2231);color:var(--txt,#fff);box-shadow:0 18px 70px rgba(0,0,0,.45)}
.ba-settings-dialog::backdrop{background:rgba(2,8,20,.7);backdrop-filter:blur(6px)}
.ba-settings-dialog h3{margin:0 0 12px;font-size:18px}.ba-settings-dialog .ba-settings-actions{display:flex;gap:8px;margin-top:16px}.ba-settings-dialog .ba-settings-actions button{flex:1}
@media (prefers-reduced-motion:reduce){.ba-pill.live i,.ba-amount.up,.ba-note.ok,.ba-bar::after{animation:none}}
`;
      doc.head.appendChild(st);
    }
    function el(tag,text,cls) { const n=doc.createElement(tag); if(text!=null)n.textContent=text;if(cls)n.className=cls;return n; }
    function button(text,fn,disabled=false,primary=false) { const b=el("button",text,primary?"btn":"btn ghost"); b.type="button";b.disabled=disabled;b.style.marginTop="8px";b.onclick=fn;if(primary)b.dataset.primary="true";return b; }
    function line(label,value) { const n=el("div",label+": "+value,"me-sub"); n.style.overflowWrap="anywhere";return n; }
    function copyBtn(text,label) {
      const b=el("button",lang==="ru"?"Копировать":lang==="zh"?"复制":"Copy","ba-copy"); b.type="button"; b.title=text;
      b.setAttribute("aria-label",(lang==="ru"?"Копировать адрес ":"Copy address ")+label);
      b.onclick=async()=>{try{await doc.defaultView.navigator.clipboard.writeText(text);b.textContent=lang==="ru"?"Скопировано":lang==="zh"?"已复制":"Copied";b.classList.add("done");}
        catch(_){b.textContent=lang==="ru"?"Не удалось":lang==="zh"?"失败":"Unavailable";}};
      return b;
    }
    function walletCard(items) {
      const box=el("div");
      for (const [label,value] of items) {
        const row=el("div",null,"ba-wal"), left=el("div");
        left.append(el("div",label,"n"), el("div",value?String(value).slice(0,6)+"…"+String(value).slice(-4):"—","a"));
        row.append(left); if(value)row.append(copyBtn(String(value),label)); box.append(row);
      }
      return box;
    }
    function balanceCard(a,grew) {
      const bal=a.balance||{}, box=el("div");
      const amount=el("div",null,"ba-amount"+(grew?" up":""));
      amount.append(doc.createTextNode(formatUnits(bal.available_units)), el("span"," pUSD"));
      box.append(amount, el("div",tr("available"),"ba-cap"));
      const rows=el("div",null,"ba-rows");
      const add=(l,v)=>{const r=el("div",null,"ba-row");r.append(el("div",l,"l"),el("div",v,"r"));rows.append(r);};
      add(tr("reserved"),formatUnits(bal.reserved_units)+" pUSD");
      add(tr("positions"),formatUnits(bal.position_value_units)+" pUSD");
      add(tr("pnl"),signedUnits(bal.realized_pnl_units)+" pUSD");
      if(bal.checked_at)rows.title=tr("checked")+": "+new Date(bal.checked_at).toLocaleString(lang);
      box.append(rows); return box;
    }
    function statePill(text,tone,live) {
      const pill=el("span",null,"ba-pill"+(tone?" "+tone:"")+(live?" live":""));
      if(tone||live)pill.append(el("i"));
      pill.append(doc.createTextNode(text)); return pill;
    }
    function escapeHtml(t){return String(t).replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
    function note(text,tone) { const n=el("div",null,"ba-note"+(tone?" "+tone:"")); n.innerHTML=text; return n; }
    function addressLine(label,value) {
      if(!value)return line(label,"—");
      const text=String(value),n=line(label,text.length>16?text.slice(0,6)+"…"+text.slice(-4):text);
      const b=el("button",lang==="ru"?"Копировать":lang==="zh"?"复制":"Copy");b.type="button";b.title=text;b.setAttribute("aria-label",(lang==="ru"?"Копировать адрес ":"Copy address ")+label);
      Object.assign(b.style,{marginLeft:"8px",padding:"2px 5px",border:"0",background:"transparent",color:"var(--accent)",fontSize:"inherit",cursor:"pointer"});
      b.onclick=async()=>{try{await doc.defaultView.navigator.clipboard.writeText(text);b.textContent=lang==="ru"?"Скопировано":lang==="zh"?"已复制":"Copied";}catch(_){b.textContent=lang==="ru"?"Не удалось":lang==="zh"?"失败":"Unavailable";}};n.append(b);return n;
    }
    function compactRow(){const n=el("div");Object.assign(n.style,{display:"flex",flexWrap:"wrap",gap:"6px",marginTop:"10px"});return n;}
    function compactButton(row,label,fn,disabled){const b=button(label,fn,disabled);Object.assign(b.style,{width:"auto",flex:"1 1 auto",padding:"7px 10px",marginTop:"0",fontSize:"12px"});row.append(b);}
    function switchRow(checked,disabled,onChange,hint,primary) {
      // Включатель режима автоставок. Включение — в два осознанных шага (переключатель → подтверждение правила),
      // выключение — сразу: запрет новых ставок безопасен и подтверждения не требует.
      const wrap=el("div",null,"ba-sw"+(checked?" on":"")), left=el("div");
      left.append(el("div",tr("autoSwitch"),"t"), el("div",checked?tr("autoOn"):tr("autoOff"),"s"));
      if(hint){const h=el("div",hint,"s");h.style.color="var(--amber,#f59e0b)";left.append(h);}
      const track=el("label",null,"ba-track"+(checked?" on":"")+(disabled?" off":""));
      const input=el("input"); input.type="checkbox"; input.checked=!!checked; input.disabled=!!disabled;
      input.setAttribute("aria-label",tr("autoSwitch")); input.onchange=()=>onChange(input.checked);
      track.append(input, el("span",null,"ba-knob"));
      if(primary)wrap.dataset.primary="true";                      // главное действие экрана — переключатель
      wrap.append(left,track); return wrap;
    }
    function consent(label) {const wrap=el("label",null,"me-sub"), check=el("input");check.type="checkbox";wrap.append(check,doc.createTextNode(" "+label));return {wrap,check};}
    function closeSettings(){if(settingsDialog){settingsDialog.close();settingsDialog.remove();settingsDialog=null;}}
    function closeTransfer(){if(transferDialog){transferDialog.close();transferDialog.remove();transferDialog=null;}transferKind=null;inputAmount="";sourceMenuOpen=false;}
    function openTransferDialog(){
      if(transferDialog)return;
      const dialog=el("dialog",null,"ba-transfer-dialog");
      dialog.onclose=()=>{dialog.remove();if(transferDialog===dialog){transferDialog=null;transferKind=null;inputAmount="";sourceMenuOpen=false;}};
      doc.body.append(dialog);transferDialog=dialog;dialog.showModal();
    }
    function paintTransfer(s){
      if(!transferDialog||!s.account)return;
      const a=s.account,o=s.operation;
      const draft=!!transferKind&&(!o||(transferKind==="WITHDRAW"?TERMINAL.has(o.state):!INTERACTIVE.has(o.state)));
      const kind=draft?transferKind:o&&o.kind;
      const body=el("div"),header=el("div",null,"ba-transfer-head"),heading=el("div");
      heading.append(el("div",tr(draft?"transferStepAmount":o&&o.state==="AWAITING_SIGNATURE"?"transferStepReview":"transferStepStatus"),"ba-transfer-step"),
        el("h3",kind?tr(kind==="FUNDING"?"fund":"withdraw"):tr("details")));
      const close=el("button","×","ba-transfer-close");close.type="button";close.setAttribute("aria-label",tr("close"));close.onclick=closeTransfer;
      header.append(heading,close);body.append(header);
      transferDialog.setAttribute("aria-label",kind?tr(kind==="FUNDING"?"fund":"withdraw"):tr("details"));
      const fc=s.fundingCheck;
      if(s.error==="INSUFFICIENT_BALANCE"&&fc&&fc.available_units!=null)body.append(note(fill(tr("shortfall"),{v:formatUnits(fc.available_units)+" pUSD",n:formatUnits(fc.needed_units)+" pUSD"}),"bad"));
      else if(s.error)body.append(note(textFor(errors,s.error,lang)+(errors[s.error]?"":" · "+(lang==="ru"?"Действие остановлено":"Action stopped"))+(s.errorDetail?"<br><small>"+escapeHtml(s.errorDetail)+"</small>":""),"bad"));
      if(draft){
        if(transferKind==="FUNDING"){
          body.append(el("div",tr("srcChoose"),"ba-cap"));
          const picker=el("div",null,"ba-picker"),chosen=sourceOf(a,fundingSource);
          const selectedName=tr(fundingSource==="POLYMARKET"?"srcPolymarket":"srcMetaMask");
          const toggle=el("button",null,"ba-picker-toggle");toggle.type="button";toggle.setAttribute("aria-expanded",String(sourceMenuOpen));
          toggle.setAttribute("aria-label",tr("srcChoose"));
          toggle.append(el("strong",selectedName+"  ⌄"),el("span",chosen?tr("availableSrc")+": "+formatUnits(chosen.available_units)+" pUSD":tr("srcUnchecked")));
          toggle.onclick=()=>{sourceMenuOpen=!sourceMenuOpen;paintTransfer(s);};picker.append(toggle);
          if(sourceMenuOpen){
            const menu=el("div",null,"ba-picker-menu");menu.setAttribute("role","listbox");menu.setAttribute("aria-label",tr("srcChoose"));
            for(const source of SOURCES){
              const snap=sourceOf(a,source),option=el("button",null,"ba-picker-option");option.type="button";option.setAttribute("role","option");
              option.setAttribute("aria-selected",String(fundingSource===source));
              option.append(doc.createTextNode(tr(source==="POLYMARKET"?"srcPolymarket":"srcMetaMask")),el("small",snap?tr("availableSrc")+": "+formatUnits(snap.available_units)+" pUSD":tr("srcUnchecked")));
              option.onclick=()=>{fundingSource=source;sourceMenuOpen=false;paintTransfer(s);};menu.append(option);
            }
            picker.append(menu);
          }
          body.append(picker);
          if(chosen){
            const fresh=chosen.fresh===true&&Date.parse(chosen.checked_at)>Date.now()-SNAPSHOT_MAX_AGE;
            const warning=!fresh?tr("srcStale"):fundingSource==="METAMASK"&&chosen.balance_units==="0"?tr("srcNoPusd"):
              fundingSource==="METAMASK"&&!(/^[0-9]+$/.test(String(chosen.pol_wei))&&BigInt(chosen.pol_wei)>=MIN_GAS_WEI)?tr("srcNoGas"):
              fundingSource==="POLYMARKET"&&chosen.owner_ok===false?tr("srcOwner"):null;
            if(warning)body.append(note(warning,"wait"));
          }
        }else body.append(el("div",tr("available")+": "+formatUnits(a.balance&&a.balance.available_units)+" pUSD","ba-cap"));
        const label=el("label",tr("amount"),"ba-transfer-input ba-cap"),input=el("input",null,"binput");
        input.type="text";input.inputMode="decimal";input.autocomplete="off";input.value=inputAmount;input.oninput=()=>{inputAmount=input.value;};label.append(input);body.append(label);
        const actions=el("div",null,"ba-transfer-actions");
        actions.append(button(tr("close"),closeTransfer),button(tr("prepare"),async()=>{
          const result=await controller.prepare(transferKind,inputAmount,transferKind==="FUNDING"?fundingSource:undefined);
          if(result){transferKind=null;inputAmount="";paint(controller.state);}
        },s.busy,true));body.append(actions);
      }else if(o){
        const viaWallet=o.kind==="FUNDING"&&o.source_kind==="METAMASK";
        body.append(statePill(stateText(opStateKey(o))+waitingLabel(o,lang),o.state==="CONFIRMED"?"on":o.state==="REJECTED"?"bad":"warn",!TERMINAL.has(o.state)));
        if(opStateKey(o)==="CHECKING")body.append(el("div",tr("checkingHint"),"ba-foot"));
        if(o.intent&&!TERMINAL.has(o.state)){
          const amt=el("div",null,"ba-amount");amt.append(doc.createTextNode(formatUnits(o.amount_units)),el("span"," pUSD"));
          body.append(amt,el("div",tr("amount").replace(/\s*pUSD\s*$/i,""),"ba-cap"));
          const rows=el("div",null,"ba-rows");
          const addr=(label,value)=>{const row=el("div",null,"ba-wal"),left=el("div");
            left.append(el("div",label,"n"),el("div",value||"—","ba-review-address"));row.append(left);
            if(value)row.append(copyBtn(String(value),label));rows.append(row);};
          addr(tr("source"),o.intent.source);addr(tr("recipient"),o.intent.recipient);
          const pair=(label,value)=>{const row=el("div",null,"ba-row");row.append(el("div",label,"l"),el("div",value,"r"));rows.append(row);};
          pair(lang==="ru"?"Сеть":lang==="zh"?"网络":"Network","Polygon · pUSD");
          if(o.kind==="FUNDING")pair(tr("actionType"),tr(viaWallet?"actionTx":"actionSign"));
          pair(tr("fees"),viaWallet?tr("gasFee"):o.fee_units==null?tr("unverifiedFee"):formatUnits(o.fee_units)+" pUSD");
          body.append(rows);
        }
        if(o.state==="AWAITING_SIGNATURE"){
          // Владелец 25.09: без галочки и без сноски — подтверждение = нажатие единственной кнопки (сумма и адреса показаны выше).
          const actions=el("div",null,"ba-transfer-actions");
          if(viaWallet){actions.append(button(tr("cancel"),()=>controller.cancelTransfer(),s.busy));
            actions.append(button(tr("sendTx"),()=>controller.sendFromWallet(true),s.busy,true));}
          else actions.append(button(tr("sign"),()=>controller.signTransfer(true),s.busy||o.fee_units==null,true));
          body.append(actions);
        }
        if(o.kind==="FUNDING"&&o.state==="REJECTED")body.append(note(reasonText(o.reason||"REJECTED")+" · "+tr("noMoneyMoved"),"bad"));
        else if(o.reason){const bad=o.state==="REJECTED"||o.state==="FAILED"||o.state==="EXPIRED_UNSENT";
          body.append(note(reasonText(o.reason)+(bad?" · "+tr("noMoneyMoved"):""),bad?"bad":"wait"));}
      }
      transferDialog.replaceChildren(body);
    }
    function openSettings(a){
      closeSettings();
      const dialog=el("dialog",null,"ba-settings-dialog"), label=el("label",tr("maxStake"),"me-sub"),input=el("input",null,"binput"),actions=el("div",null,"ba-settings-actions");
      input.type="text";input.inputMode="decimal";input.value=String(a.policy.max_stake_bps/100);label.append(input);
      dialog.setAttribute("aria-label",tr("settings"));
      const cancel=button(tr("close"),()=>closeSettings()),save=button(tr("save"),async()=>{const r=await controller.settings(input.value);if(r)closeSettings();},false,true);
      actions.append(cancel,save);dialog.append(el("h3",tr("settings")),label,actions);
      dialog.onclose=()=>{dialog.remove();if(settingsDialog===dialog)settingsDialog=null;};
      doc.body.append(dialog);settingsDialog=dialog;dialog.showModal();input.focus();
    }
    function paint(s) {
      ensureStyles();
      root.style.display="block"; const view=doc.createDocumentFragment();
      const holdHeight=s.busy?Math.ceil(root.getBoundingClientRect().height):0;
      try {
      const head=el("div",null,"ba-head"); head.append(el("div",tr("title"),"k"));
      const lab=stateLabel(s), tone=s.busy?null:(lab==="ACTIVE"||lab==="ACTIVE_NO_SIGNAL")?"on":(lab==="STOPPED"||lab==="ERROR")?"bad":(lab==="NEEDS_FUNDING"||lab==="STALE")?"warn":null;
      head.append(statePill(s.busy?tr("waiting"):stateText(lab),s.busy?"warn":tone,s.busy||lab==="ACTIVE"||lab==="ACTIVE_NO_SIGNAL"));
      view.append(head);
      if (s.status === "SIGNED_OUT") {view.append(el("p",stateText("SIGNED_OUT"),"me-sub"));return;}
      const progress=el("div",null,"ba-progress");if(s.busy)progress.append(el("div",null,"ba-bar"));view.append(progress);
      const fc=s.fundingCheck;
      if(s.error==="INSUFFICIENT_BALANCE"&&fc&&fc.available_units!=null)view.append(note(fill(tr("shortfall"),{v:formatUnits(fc.available_units)+" pUSD",n:formatUnits(fc.needed_units)+" pUSD"}),"bad"));
      else if(s.error)view.append(note(textFor(errors,s.error,lang)+(errors[s.error]?"":" · "+(lang==="ru"?"Действие остановлено":"Action stopped"))+(s.errorDetail?"<br><small>"+escapeHtml(s.errorDetail)+"</small>":""),"bad"));
      const a=s.account;
      if(!a) {
        if(s.status==="NOT_CONNECTED")view.append(el("p",tr("connectHint"),"me-sub"),button(tr("connect"),()=>controller.connect(),s.busy,true));
        if(s.status==="NOT_CREATED") {
          view.append(el("p",tr("custody"),"me-sub"));const c=consent(tr("custodyAccept"));view.append(c.wrap);
          view.append(button(tr("create"),()=>controller.create(c.check.checked),s.busy,true));
        }
        view.append(button(tr("refresh"),()=>controller.refresh(),s.busy));return;
      }
      if(lastAccount!==a.account_id){lastAccount=a.account_id;closeTransfer();closeSettings();enableOpen=false;lastAvailable=null;walletsOpen=false;checksOpen=false;}
      const av=(a.balance&&a.balance.available_units)||"0";
      const units=x=>/^(0|[1-9][0-9]*)$/.test(String(x||""))?BigInt(x):null;   // отрисовка не должна падать на пустом балансе
      const nowU=units(av), prevU=units(lastAvailable);
      const grew=nowU!=null&&prevU!=null&&nowU>prevU; lastAvailable=av;
      view.append(balanceCard(a,grew));
      if(grew)view.append(note(tr("fundedOk"),"ok"));
      const wallets=el("details",null,"ba-fold");wallets.open=walletsOpen;
      wallets.ontoggle=()=>{walletsOpen=wallets.open;};
      wallets.append(el("summary",lang==="ru"?"Адреса кошельков":lang==="zh"?"钱包地址":"Wallet addresses"),walletCard([["Polymarket",a.funding_wallet],["AISports",a.bot_deposit_wallet]]),el("div",tr("custodyShort"),"ba-foot"));
      view.append(wallets);
      if(a.policy&&a.policy.enabled)view.append(line(lang==="ru"?"Проверка торговли":lang==="zh"?"交易检查":"Trading check",a.last_checked_at?new Date(a.last_checked_at).toLocaleString(lang):"—"));
      if(a.reason&&a.reason!=="NO_SIGNAL")view.append(line(lang==="ru"?"Причина":"Reason",reasonText(a.reason)));
      const ready=a.state==="READY"&&!!a.bot_deposit_wallet&&!!a.collateral, o=s.operation;
      const unfinished=o&&!TERMINAL.has(o.state), interactive=o&&INTERACTIVE.has(o.state), hasFunds=!!(a.balance&&/^[1-9][0-9]*$/.test(a.balance.available_units));
      const openTransfer=kind=>{transferKind=kind;closeSettings();sourceMenuOpen=false;openTransferDialog();paintTransfer(s);};
      const openOperation=()=>{transferKind=null;closeSettings();openTransferDialog();paintTransfer(s);};
      const actions=compactRow();compactButton(actions,tr("refresh"),()=>controller.refresh(),s.busy);
      if(a.state==="ERROR"&&a.reason==="PROVIDER_ACCESS_DENIED")compactButton(actions,tr("retryCreate"),()=>controller.retryProvision(),s.busy);
      if(ready){
        // Владелец 25.09 (телефон: «Пополнить» не реагирует): при незакрытой операции кнопка открывает ЕЁ, а не молчит.
        if(hasFunds||unfinished||transferKind)compactButton(actions,tr("fund"),()=>interactive?openOperation():openTransfer("FUNDING"),s.busy);
        compactButton(actions,tr("withdraw"),()=>openTransfer("WITHDRAW"),s.busy||!!unfinished||!hasFunds);
        if(a.policy)compactButton(actions,tr("settings"),()=>openSettings(a),s.busy);
      }
      const tail=()=>{                                          // вспомогательные кнопки уходят под главный элемент управления
        if(ready&&!hasFunds&&!interactive)view.append(button(tr("fund"),()=>openTransfer("FUNDING"),s.busy,true));
        view.append(actions);
      };
      if(a.policy) {
        const on=!!a.policy.enabled;
        // Выключение доступно ВСЕГДА (запрет новых ставок не должен ждать операций): причины блокируют только включение.
        const blocked=on?null:(s.busy?null:!ready?tr("autoNeedReady"):interactive?tr("autoBusyOp"):!hasFunds?tr("autoNeedFunds"):null);
        const switchIsPrimary=!on&&!blocked&&!s.busy&&!enableOpen;
        view.append(switchRow(on,s.busy||!!blocked,checked=>{
          if(!checked){enableOpen=false;controller.stop();return;}      // выключение — сразу, без подтверждения
          enableOpen=true;paint(s);                                     // включение — показать правило и подтвердить
        },blocked,switchIsPrimary));
        if(!on&&enableOpen&&!blocked&&!s.busy) {
          view.append(el("p",tr("policy")+" "+a.policy.max_open+".","me-sub"),line(tr("stakeLimit"),a.policy.max_stake_bps/100+"%"));
          view.append(button(tr("autoConfirm"),()=>{enableOpen=false;controller.enable(true);},s.busy,true));
        }
        tail();
        if(on||a.reason==="USER_STOP")view.append(el("p",tr("stopInfo"),"ba-foot"));
      } else tail();
      if(o&&!transferKind){
        const strip=el("div",null,"ba-transfer-status");
        strip.append(el("span",kindText(o.kind)+" · "+stateText(opStateKey(o))+waitingLabel(o,lang)));
        const details=el("button",tr("transferOpen"));details.type="button";details.onclick=openOperation;
        strip.append(details);view.append(strip);
      }
      paintTransfer(s);
      // Past deposits, withdrawals and bets will have their own history screen.
      if(Array.isArray(a.latest_decisions)&&a.latest_decisions.length){
        const checks=el("details",null,"ba-fold");checks.open=checksOpen;checks.ontoggle=()=>{checksOpen=checks.open;};
        checks.append(el("summary",lang==="ru"?"Последние проверки ставок":lang==="zh"?"最近投注检查":"Recent bet checks"));
        for(const decision of a.latest_decisions.slice(0,20))checks.append(line(decision.at?new Date(decision.at).toLocaleString(lang):"—",reasonText(decision.reason)));
        view.append(checks);
      }
      schedulePoll(s);
      } finally {
        root.style.minHeight=holdHeight?holdHeight+"px":"";
        root.replaceChildren(view);
      }
    }
    // Незакрытая операция перечитывается сама каждые 5 с — только чтение; кнопка «Обновить» тоже ничего не создаёт.
    function schedulePoll(s) {
      const win=doc.defaultView; if(pollTimer){win.clearTimeout(pollTimer);pollTimer=null;}
      const o=s.operation;
      const checking=o&&opStateKey(o)==="CHECKING";
      if(!s.busy&&s.account&&o&&!TERMINAL.has(o.state)&&o.state!=="AWAITING_SIGNATURE")pollTimer=win.setTimeout(async()=>{
        pollTimer=null;const terminal=await controller.pollOperation(o.operation_id);
        if(terminal)await controller.refresh();
        else if(checking&&controller.state.operation&&opStateKey(controller.state.operation)==="CHECKING"&&!controller.state.busy)paint(controller.state); // тикает время ожидания
        else schedulePoll(controller.state);
      },checking?3000:5000);   // пока сервис готовит перевод — чаще
    }
    controller.render=paint;controller.reset();
    return {refresh:()=>controller.refresh(),backgroundRefresh:()=>transferDialog||settingsDialog?null:controller.refresh(),reset:()=>{closeTransfer();closeSettings();enableOpen=false;lastAccount=null;controller.reset();},controller};
  }
  return {API_VERSION,PUSD,Controller,ClientError,parseUnits,formatUnits,accountCheck,validateTransfer,validateWalletTransfer,fundingCheck,sourceOf,opStateKey,checkEligibility,stateLabel,mount};
});
