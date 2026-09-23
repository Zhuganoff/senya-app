/* Same-page EIP-1193 connection. This module never receives Telegram initData or signatures. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AISportsWallet=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const BUNDLE='vendor/metamask-connect-2.1.1.js';
  const INTEGRITY='sha384-vb4b622MoP3ouiMpIrdo9BSwo87J7FgHMz8JMwc3gyfgUYgene5LNwYhjNmobO+W';
  function createConnector({window:w,polygonRPC,loadSDK}) {
    let client=null,pending=null,provider=null,scriptPromise=null;
    const discovered=[];
    w.addEventListener('eip6963:announceProvider',e=>{
      if(e.detail&&e.detail.info&&e.detail.info.rdns==='io.metamask'&&typeof e.detail.provider?.request==='function')discovered.push(e.detail.provider);
    });
    w.dispatchEvent(new w.Event('eip6963:requestProvider'));
    function sdk(){
      if(loadSDK)return loadSDK();
      if(w.AISportsMetaMaskConnect)return Promise.resolve(w.AISportsMetaMaskConnect);
      if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
        const script=w.document.createElement('script');script.src=BUNDLE;script.integrity=INTEGRITY;script.crossOrigin='anonymous';
        script.onload=()=>w.AISportsMetaMaskConnect?resolve(w.AISportsMetaMaskConnect):reject(Error('WALLET_UNAVAILABLE'));
        script.onerror=()=>{script.remove();scriptPromise=null;reject(Error('WALLET_UNAVAILABLE'));};
        w.document.head.append(script);
      });
      return scriptPromise;
    }
    async function connect(){
      if(provider)return provider;
      const injected=discovered[0]||(w.ethereum&&(w.ethereum.providers||[w.ethereum]).find(p=>p.isMetaMask&&typeof p.request==='function'));
      if(injected){provider=injected;return provider;}
      if(pending)return pending;
      pending=(async()=>{
        const module=await sdk();
        if(!client)client=await module.createEVMClient({
          dapp:{name:'AI Sports',url:new URL(w.location.origin).origin},
          api:{supportedNetworks:{'0x89':polygonRPC}},
          analytics:{enabled:false},debug:false,skipAutoAnnounce:true,
          ui:{headless:false,preferExtension:false},mobile:{useDeeplink:false}
        });
        await client.connect({chainIds:['0x89']});
        const result=client.getProvider();
        if(!result||typeof result.request!=='function')throw Error('WALLET_UNAVAILABLE');
        provider=result;return result;
      })();
      try{return await pending;}finally{pending=null;}
    }
    return {connect};
  }
  return {createConnector,BUNDLE,INTEGRITY};
});
