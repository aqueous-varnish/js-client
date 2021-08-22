import AQVS from '../';
import Web3 from 'web3';
import contract from '@truffle/contract';

window.AQVS = AQVS;

document.getElementById('paywall').addEventListener('click', async function(e) {
  AQVS.setContract(contract);
  await AQVS.setEnv('dev');
  await AQVS.setWeb3(new Web3(window.ethereum));

  AQVS.browser.invokePaywall(117, {
    contextText: 'Sanctuary Computer', // Ignored because contextImage is used
    contextImage: 'http://profit.sanctuary.computer/images/logo-1407f595cd12e393e698a7abc05bc468.svg',
    callback: function(err) {
      if (!err) {
        AQVS.browser.closePaywall();
      }
    }
  });
});
