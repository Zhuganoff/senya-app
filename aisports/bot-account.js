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
  class ClientError extends Error { constructor(code) { super(code); this.code = code; } }
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
    return e instanceof ClientError ? e.code : "SOURCE_UNAVAILABLE";
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
    constructor({rpc, session, wallet, resolveWallet, eligibility = async()=>fail("GEOBLOCK_UNVERIFIED"), render = () => {}, uuid, now = Date.now}) {
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
      this.assert(c);
      const r = await this.rpc(name, {...params,p_init_data:c.auth});
      this.assert(c);
      return legacy ? r : envelope(r);
    }
    key(action) { if (!this.idempotency.has(action)) this.idempotency.set(action,this.uuid()); return this.idempotency.get(action); }
    adopt(c, r) {
      if (r.account) accountCheck(r.account);
      if (r.account && this.state.account && r.account.account_id !== this.state.account.account_id) fail("ACCOUNT_CHANGED");
      const update = {status:r.status,error:null};
      if (Object.hasOwn(r,"account")) update.account = r.account;
      if (Object.hasOwn(r,"operation")) update.operation = r.operation;
      this.paint(c,update); return r;
    }
    async run(fn) {
      let c;
      try {
        c = this.context();
        if (this.state.busy) return null;
        this._runningContext=c;
        this.paint(c,{busy:true,error:null});
        return await fn(c);
      } catch(e) {
        if (c && this.alive(c)) this.paint(c,{error:errorCode(e)});
        return null;
      } finally { if (c && this.alive(c) && this._runningContext===c) {this._runningContext=null;this.paint(c,{busy:false});} }
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
          this.paint(c,{history:h.operations,...(!this.state.operation&&unfinished?{operation:unfinished}:{})});
          if (this.state.operation && !TERMINAL.has(this.state.operation.state)) {
            this.adopt(c,await this.call(c,"bot_account_operation",{p_operation_id:this.state.operation.operation_id}));
          }
        }
        return r;
      });
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
    async prepare(kind, amount) {
      return this.run(async c => {
        if (!["FUNDING","WITHDRAW"].includes(kind)) fail("INVALID_OPERATION");
        const a = accountCheck(this.state.account), units = parseUnits(amount);
        if (this.state.operation && !TERMINAL.has(this.state.operation.state)) fail("OPERATION_IN_PROGRESS");
        if (kind === "WITHDRAW" && (!a.balance || integer(units) > integer(a.balance.available_units))) fail("INSUFFICIENT_AVAILABLE");
        const action=kind+":"+units+":"+a.version;
        const r = this.adopt(c,await this.call(c,"bot_account_prepare_transfer",{p_kind:kind,p_amount:amount,p_idempotency_key:this.key(action)}));
        if (!r.operation || r.operation.kind !== kind || r.operation.amount_units !== units) fail("OPERATION_MISMATCH");
        this.idempotency.delete(action); // The server now owns this operation; a later completed transfer may be followed by another of the same amount.
        this.paint(c,{reviewed:false}); return r;
      });
    }
    async openOperation(id) {
      return this.run(async c => { if (!UUID.test(id)) fail("INVALID_OPERATION"); return this.adopt(c,await this.call(c,"bot_account_operation",{p_operation_id:id})); });
    }
    async checkedWallet(c, expected) {
      const provider = await this.wallet(); this.assert(c);
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
        const provider = await this.wallet(); this.assert(c);
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
    custodyShort:["Ключ счёта AISports хранит сервис. Основной ключ вашего кошелька не передаётся.","The service holds the AISports account key. Your main wallet key is never shared.","AISports 账户密钥由服务保管，不会获取您的主钱包密钥。"],
    create:["Создать торговый счёт","Create trading account","创建交易账户"], retryCreate:["Повторить создание","Retry account creation","重试创建账户"], connect:["Подключить MetaMask","Connect MetaMask","连接 MetaMask"],
    connectHint:["В браузере подключится расширение MetaMask. В Telegram на компьютере используйте QR для MetaMask на телефоне; расширение Chrome внутри Telegram недоступно. На телефоне подтвердите подключение в приложении MetaMask и вернитесь сюда.","A browser can connect to the MetaMask extension. In desktop Telegram, use the QR code with MetaMask on your phone; Chrome extensions are unavailable inside Telegram. On mobile, approve in MetaMask and return here.","浏览器可连接 MetaMask 扩展。桌面 Telegram 请用手机 MetaMask 扫描二维码，Telegram 内不能使用 Chrome 扩展。手机上请在 MetaMask 确认后返回。"],
    refresh:["Обновить","Refresh","刷新"], fund:["Пополнить","Add funds","充值"], withdraw:["Вывести","Withdraw","提现"],
    settings:["Настройки","Settings","设置"], stop:["Остановить новые ставки","Stop new bets","停止新投注"], enable:["Включить автоставки","Enable auto-bets","启用自动投注"],
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
    policy:["MLB. Меньшая из доли стратегии и вашего максимума; комиссия входит в риск. Максимум открытых позиций:","MLB. The lower of the strategy allocation and your maximum; fees count toward risk. Maximum open positions:","MLB。采用策略比例和您上限中的较低值，费用计入风险。最大未平仓数量："],
    stopInfo:["Остановка запрещает новые ставки. Отправленные заявки и переводы продолжают сверяться, открытые позиции сохраняются.","Stopping prevents new bets. Submitted orders and transfers continue to reconcile; positions remain open.","停止后不再新增投注，已发送的订单与转账继续核对，现有持仓保留。"],
    separate:["Личный счёт Polymarket остаётся отдельным. Прежние деньги сюда автоматически не переносятся.","Your personal Polymarket account remains separate. Existing funds are not moved automatically.","您的个人 Polymarket 账户保持独立，现有资金不会自动转入。"],
    checked:["Последняя сверка","Last checked","上次核对"], details:["Подробности","Details","详情"], waiting:["Проверяем состояние…","Checking status…","正在检查状态…"]
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
    INSUFFICIENT_AVAILABLE:["Недостаточно подтверждённых свободных средств.","Insufficient confirmed available funds.","已确认可用资金不足。"],
    INVALID_POLICY:["Максимум ставки должен быть больше 0 и не выше 10%.","Stake maximum must be above 0 and no more than 10%.","单注上限必须大于0且不超过10%。"],
    WALLET_UNAVAILABLE:["Откройте приложение в поддерживаемом кошельке или подключите MetaMask. Данные Telegram в ссылку не передаются.","Connect MetaMask in a supported browser. Telegram data is never copied into a link.","请在支持的浏览器连接 MetaMask，Telegram 数据不会传入链接。"],
    OPERATION_IN_PROGRESS:["Сначала уточните исход текущей операции.","Resolve the current transaction before starting another.","请先核对当前交易结果。"],
    FEES_UNVERIFIED:["Комиссия пока не подтверждена. Подпись недоступна.","The fee is not confirmed yet. Signing is unavailable.","费用尚未确认，暂不能签名。"]
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
    PROVIDER_ACCESS_DENIED:["Polymarket не разрешил приложению создать торговый счёт. Деньги не переводились.","Polymarket did not allow the app to create the trading account. No funds were moved.","Polymarket 未允许应用创建交易账户，资金未转移。"]
  };
  function textFor(table,key,lang) { const x=table[key]; return x ? x[{ru:0,en:1,zh:2}[lang] || 0] : key; }
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
    let transferKind=null, inputAmount="", settingsOpen=false, percent="", enableOpen=false, lastAccount=null;
    function el(tag,text,cls) { const n=doc.createElement(tag); if(text!=null)n.textContent=text;if(cls)n.className=cls;return n; }
    function button(text,fn,disabled=false,primary=false) { const b=el("button",text,primary?"btn":"btn ghost"); b.type="button";b.disabled=disabled;b.style.marginTop="8px";b.onclick=fn;if(primary)b.dataset.primary="true";return b; }
    function line(label,value) { const n=el("div",label+": "+value,"me-sub"); n.style.overflowWrap="anywhere";return n; }
    function walletCard(items) {
      // Владелец 24.09: адреса — крупно и аккуратно, без пояснительных абзацев вокруг.
      const box = el("div"); Object.assign(box.style,{marginTop:"10px",padding:"10px 12px",border:"1px solid var(--line, rgba(125,142,170,.25))",
                                                      borderRadius:"12px",display:"grid",gap:"8px"});
      for (const [label,value] of items) {
        const row = el("div"); Object.assign(row.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"});
        const name = el("span",label); Object.assign(name.style,{color:"var(--mut)",fontSize:"12px",flex:"0 0 auto"});
        const text = String(value||""), short = text.length>16 ? text.slice(0,6)+"…"+text.slice(-4) : (text||"—");
        const addr = el("span",short); Object.assign(addr.style,{fontSize:"16px",fontWeight:"700",letterSpacing:".01em",fontVariantNumeric:"tabular-nums"});
        addr.title = text;
        const right = el("div"); Object.assign(right.style,{display:"flex",alignItems:"center",gap:"6px",minWidth:"0"});
        right.append(addr);
        if (text) {
          const b = el("button",lang==="ru"?"Копировать":lang==="zh"?"复制":"Copy"); b.type="button"; b.title=text;
          b.setAttribute("aria-label",(lang==="ru"?"Копировать адрес ":"Copy address ")+label);
          Object.assign(b.style,{padding:"2px 6px",border:"0",background:"transparent",color:"var(--accent)",fontSize:"12px",cursor:"pointer"});
          b.onclick=async()=>{try{await doc.defaultView.navigator.clipboard.writeText(text);b.textContent=lang==="ru"?"Скопировано":lang==="zh"?"已复制":"Copied";}catch(_){b.textContent=lang==="ru"?"Не удалось":lang==="zh"?"失败":"Unavailable";}};
          right.append(b);
        }
        row.append(name,right); box.append(row);
      }
      return box;
    }
    function balanceCard(a) {
      // Свободные средства — крупно; остальное компактной строкой. Время сверки — подсказкой, не отдельной строкой.
      const bal = a.balance || {}, box = el("div"); Object.assign(box.style,{marginTop:"10px"});
      const big = el("div"); Object.assign(big.style,{display:"flex",alignItems:"baseline",gap:"8px"});
      const v = el("span",formatUnits(bal.available_units)+" pUSD"); Object.assign(v.style,{fontSize:"22px",fontWeight:"800",fontVariantNumeric:"tabular-nums"});
      const c = el("span",tr("available")); Object.assign(c.style,{color:"var(--mut)",fontSize:"12px"});
      big.append(v,c); box.append(big);
      const parts=[tr("reserved")+" "+formatUnits(bal.reserved_units)+" pUSD",
                   tr("positions")+" "+formatUnits(bal.position_value_units)+" pUSD",
                   tr("pnl")+" "+signedUnits(bal.realized_pnl_units)+" pUSD"];
      const sub = el("div",parts.join(" · "),"me-sub");
      if (bal.checked_at) sub.title = tr("checked")+": "+new Date(bal.checked_at).toLocaleString(lang);
      box.append(sub); return box;
    }
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
      // Владелец 24.09: видимый включатель режима автоставок. Включение — в два осознанных шага (переключатель → подтверждение правила),
      // выключение — сразу: запрет новых ставок безопасен и подтверждения не требует.
      const wrap=el("div"); Object.assign(wrap.style,{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",
                                                      marginTop:"12px",padding:"10px 12px",borderRadius:"12px",
                                                      border:"1px solid var(--line, rgba(125,142,170,.25))"});
      const left=el("div"); const name=el("div",tr("autoSwitch")); Object.assign(name.style,{fontSize:"15px",fontWeight:"700"});
      const state=el("div",checked?tr("autoOn"):tr("autoOff"),"me-sub"); state.style.marginTop="2px";
      if(checked)state.style.color="var(--accent)";
      left.append(name,state); if(hint){const h=el("div",hint,"me-sub");h.style.fontSize="11px";left.append(h);}
      const label=el("label"); Object.assign(label.style,{position:"relative",flex:"0 0 auto",width:"52px",height:"30px",
                                                          cursor:disabled?"not-allowed":"pointer",opacity:disabled?".45":"1"});
      const input=el("input"); input.type="checkbox"; input.checked=!!checked; input.disabled=!!disabled;
      input.setAttribute("aria-label",tr("autoSwitch"));
      Object.assign(input.style,{position:"absolute",opacity:"0",width:"100%",height:"100%",margin:"0",cursor:"inherit"});
      const track=el("span"); Object.assign(track.style,{position:"absolute",inset:"0",borderRadius:"999px",transition:"background .15s",
                                                         background:checked?"var(--accent)":"rgba(125,142,170,.35)"});
      const knob=el("span"); Object.assign(knob.style,{position:"absolute",top:"3px",left:checked?"25px":"3px",width:"24px",height:"24px",
                                                       borderRadius:"50%",background:"#fff",transition:"left .15s",boxShadow:"0 1px 3px rgba(0,0,0,.35)"});
      input.onchange=()=>onChange(input.checked);
      if(primary)wrap.dataset.primary="true";                      // главное действие экрана — переключатель (инвариант «одно главное действие»)
      label.append(input,track,knob); wrap.append(left,label); return wrap;
    }
    function consent(label) {const wrap=el("label",null,"me-sub"), check=el("input");check.type="checkbox";wrap.append(check,doc.createTextNode(" "+label));return {wrap,check};}
    function paint(s) {
      root.style.display="block"; root.replaceChildren();root.append(el("div",tr("title"),"k"));
      if (s.status === "SIGNED_OUT") {root.append(el("p",stateText("SIGNED_OUT"),"me-sub"));return;}
      root.append(el("p",s.busy ? tr("waiting") : stateText(stateLabel(s)),"me-sub"));
      if(s.error)root.append(el("p",textFor(errors,s.error,lang)+(errors[s.error]?"":" · "+(lang==="ru"?"Действие остановлено":"Action stopped")),"me-sub"));
      const a=s.account;
      if(!a) {
        if(s.status==="NOT_CONNECTED")root.append(el("p",tr("connectHint"),"me-sub"),button(tr("connect"),()=>controller.connect(),s.busy,true));
        if(s.status==="NOT_CREATED") {
          root.append(el("p",tr("custody"),"me-sub"));const c=consent(tr("custodyAccept"));root.append(c.wrap);
          root.append(button(tr("create"),()=>controller.create(c.check.checked),s.busy,true));
        }
        root.append(button(tr("refresh"),()=>controller.refresh(),s.busy));return;
      }
      if(lastAccount!==a.account_id){lastAccount=a.account_id;transferKind=null;inputAmount="";settingsOpen=false;percent="";enableOpen=false;}
      root.append(walletCard([["Polymarket",a.funding_wallet],["AISports",a.bot_deposit_wallet]]));
      root.append(balanceCard(a));
      const custody=el("p",tr("custodyShort"),"me-sub"); custody.style.fontSize="11px"; root.append(custody);
      if(a.policy&&a.policy.enabled)root.append(line(lang==="ru"?"Проверка торговли":lang==="zh"?"交易检查":"Trading check",a.last_checked_at?new Date(a.last_checked_at).toLocaleString(lang):"—"));
      if(a.reason&&a.reason!=="NO_SIGNAL")root.append(line(lang==="ru"?"Причина":"Reason",reasonText(a.reason)));
      const ready=a.state==="READY"&&!!a.bot_deposit_wallet&&!!a.collateral, o=s.operation;
      const unfinished=o&&!TERMINAL.has(o.state), hasFunds=!!(a.balance&&/^[1-9][0-9]*$/.test(a.balance.available_units));
      const openTransfer=kind=>{transferKind=kind;settingsOpen=false;paint(s);};
      const actions=compactRow();compactButton(actions,tr("refresh"),()=>controller.refresh(),s.busy);
      if(a.state==="ERROR"&&a.reason==="PROVIDER_ACCESS_DENIED")compactButton(actions,tr("retryCreate"),()=>controller.retryProvision(),s.busy);
      if(ready){
        if(hasFunds||unfinished||transferKind||settingsOpen)compactButton(actions,tr("fund"),()=>openTransfer("FUNDING"),s.busy||!!unfinished);
        compactButton(actions,tr("withdraw"),()=>openTransfer("WITHDRAW"),s.busy||!!unfinished||!hasFunds);
        if(a.policy)compactButton(actions,tr("settings"),()=>{settingsOpen=!settingsOpen;transferKind=null;percent=String(a.policy.max_stake_bps/100);paint(s);},s.busy||!!unfinished);
      }
      root.append(actions);
      if(ready&&!hasFunds&&!unfinished&&!transferKind&&!settingsOpen)root.append(button(tr("fund"),()=>openTransfer("FUNDING"),s.busy,true));
      if(a.policy) {
        if(settingsOpen)root.append(el("p",tr("policy")+" "+a.policy.max_open+".","me-sub"),line(tr("stakeLimit"),a.policy.max_stake_bps/100+"%"));
        if(settingsOpen) {
          const label=el("label",tr("maxStake"),"me-sub"), input=el("input",null,"binput");input.type="text";input.inputMode="decimal";input.value=percent;input.oninput=()=>{percent=input.value;};label.append(input);root.append(label);
          root.append(button(tr("save"),()=>controller.settings(percent),s.busy,true));
        }
        const on=!!a.policy.enabled;
        // Выключение доступно ВСЕГДА (запрет новых ставок не должен ждать операций): причины блокируют только включение.
        const blocked=on?null:(s.busy?null:!ready?tr("autoNeedReady"):unfinished?tr("autoBusyOp"):!hasFunds?tr("autoNeedFunds"):null);
        const switchIsPrimary=!on&&!blocked&&!s.busy&&!enableOpen&&!transferKind&&!settingsOpen;
        root.append(switchRow(on,s.busy||!!blocked,checked=>{
          if(!checked){enableOpen=false;controller.stop();return;}      // выключение — сразу, без подтверждения
          enableOpen=true;paint(s);                                     // включение — показать правило и подтвердить
        },blocked,switchIsPrimary));
        if(!on&&enableOpen&&!blocked&&!s.busy) {
          root.append(el("p",tr("policy")+" "+a.policy.max_open+".","me-sub"),line(tr("stakeLimit"),a.policy.max_stake_bps/100+"%"));
          root.append(button(tr("autoConfirm"),()=>{enableOpen=false;controller.enable(true);},s.busy,true));
        }
        if(on||a.reason==="USER_STOP")root.append(el("p",tr("stopInfo"),"me-sub"));
      }
      if(transferKind&&(!o||TERMINAL.has(o.state))) {
        const label=el("label",tr("amount"),"me-sub"),input=el("input",null,"binput");input.type="text";input.inputMode="decimal";input.autocomplete="off";input.value=inputAmount;input.oninput=()=>{inputAmount=input.value;};label.append(input);root.append(label);
        root.append(button(tr("prepare"),async()=>{const result=await controller.prepare(transferKind,inputAmount);if(result){transferKind=null;inputAmount="";}},s.busy,true));
      }
      if(o) {
        root.append(el("p",kindText(o.kind)+" · "+stateText(o.state),"me-sub"));
        if(o.intent) {
          root.append(line(tr("amount"),formatUnits(o.amount_units)+" pUSD · Polygon"),addressLine(tr("source"),o.intent.source),addressLine(tr("recipient"),o.intent.recipient));
          root.append(line(tr("fees"),o.fee_units==null?tr("unverifiedFee"):formatUnits(o.fee_units)+" pUSD"));
          root.append(el("p",tr("transferSigning"),"me-sub"));
        }
        if(o.state==="AWAITING_SIGNATURE") {
          const c=consent(tr("transferAccept"));root.append(c.wrap,button(tr("sign"),()=>controller.signTransfer(c.check.checked),s.busy || o.fee_units==null,true));
        }
        if(o.reason)root.append(line(lang==="ru"?"Причина":"Reason",reasonText(o.reason)));
      }
      // Владелец 24.09: в списке — только деньги и ставки. Технические шаги счёта (создание, подготовка разрешений)
      // пользователю не нужны: их исход и так виден состоянием счёта и причиной наверху.
      const TECH=new Set(["PROVISION","APPROVE"]);
      const shown=s.history.filter(h=>!TECH.has(h.kind)||h.amount_units!=null&&h.amount_units!=="0");
      if(shown.length){
      root.append(el("h4",tr("history")));
      for(const h of shown.slice(0,100)) {
        const d=el("details"), title=[h.match||h.match_name||kindText(h.kind),stateText(h.state),h.amount_units!=null?formatUnits(h.amount_units)+" pUSD":null].filter(Boolean).join(" · ");d.append(el("summary",title));
        for(const [key,label] of [["side",lang==="ru"?"Сторона":"Side"],["market_family",lang==="ru"?"Рынок":"Market"],["average_price",lang==="ru"?"Средняя цена исполнения, pUSD за долю":"Average fill price, pUSD/share"],["fee_units",tr("fees")],["realized_pnl_units",tr("pnl")],["created_at",lang==="ru"?"Время":"Time"],["reason",lang==="ru"?"Причина":"Reason"]]) if(h[key]!=null)d.append(line(label,key==="fee_units"?formatUnits(h[key])+" pUSD":key==="realized_pnl_units"?signedUnits(h[key])+" pUSD":String(h[key])));
        if(h.result)d.append(line(lang==="ru"?"Исполнение":"Execution",h.result==="FILLED"?(lang==="ru"?"Ставка исполнена":"Order filled"):h.result==="SETTLED"?(lang==="ru"?"Выплата подтверждена":"Payout confirmed"):h.result));
        if(h.order_id)d.append(addressLine(lang==="ru"?"Ордер":"Order",h.order_id));if(h.tx_hash)d.append(addressLine(lang==="ru"?"Транзакция":"Transaction",h.tx_hash));
        if(UUID.test(h.operation_id))d.append(button(tr("details"),()=>controller.openOperation(h.operation_id),s.busy));root.append(d);
      }
      }
      if(Array.isArray(a.latest_decisions)&&a.latest_decisions.length){
        root.append(el("h4",lang==="ru"?"Последние проверки ставок":lang==="zh"?"最近投注检查":"Recent bet checks"));
        for(const decision of a.latest_decisions.slice(0,20))root.append(line(decision.at?new Date(decision.at).toLocaleString(lang):"—",reasonText(decision.reason)));
      }
    }
    controller.render=paint;controller.reset();
    return {refresh:()=>controller.refresh(),reset:()=>{transferKind=null;inputAmount="";settingsOpen=false;percent="";enableOpen=false;lastAccount=null;controller.reset();},controller};
  }
  return {API_VERSION,PUSD,Controller,ClientError,parseUnits,formatUnits,accountCheck,validateTransfer,checkEligibility,stateLabel,mount};
});
