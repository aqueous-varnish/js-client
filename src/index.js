import paywallHTML from './html/paywall';

const ERRORS = {
  no_web3_set: 'no_web3_set',
  wrong_network: 'wrong_network',
  abi_request_failed: 'abi_request_failed',
  delete_filepath_empty: 'delete_filepath_empty',
  space_does_not_exist: 'space_does_not_exist',
  invalid_environment: 'invalid_environment'
};

const ENVIRONMENTS = {
  'dev': {
    proxy: 'http://localhost:3000',
    networkId: 5777
  },
  'ropsten': {
    proxy: 'https://ropsten.aqueousvarni.sh',
    networkId: 3
  },
  'rinkeby': {
    proxy: 'https://rinkeby.aqueousvarni.sh',
    networkId: 4
  },
  'mainnet': {
    proxy: 'https://mainnet.aqueousvarni.sh',
    networkId: 1
  }
};

const AQVS = {
  ENVIRONMENTS,
  ERRORS,

  env: 'mainnet',
  setEnv: async (env) => {
    if (!Object.keys(ENVIRONMENTS).includes(env)) throw new Error(ERRORS.invalid_environment);
    AQVS.env = env;
    if (!!AQVS.contracts) await AQVS.initContracts();
  },

  web3: null,
  setWeb3: async (web3) => {
    const env = ENVIRONMENTS[AQVS.env];
    const networkId = await web3.eth.net.getId();
    if (networkId !== env.networkId) throw new Error(ERRORS.wrong_network);
    AQVS.web3 = web3;
    if (!!AQVS.contracts) await AQVS.initContracts();
  },

  fetch: null,
  setFetch: (fetch) => {
    AQVS.fetch = fetch;
  },

  contract: null,
  setContract: (contract) => {
    AQVS.contract = contract;
  },

  ABI: {},
  setABI: (abi) => {
    AQVS.ABI = abi;
  },

  contracts: null,
  spaceContracts: {},
  initContracts: async () => {
    if (!AQVS.web3) throw new Error(ERRORS.no_web3_set);

    // TODO: Test that networkId matches
    const env = ENVIRONMENTS[AQVS.env];

    let { aqvsABI, tokensABI, spaceABI } = AQVS.ABI;
    if (!aqvsABI || !tokensABI || !spaceABI) {
      const aqvsABIResponse = await AQVS.fetch(`${env.proxy}/artifacts/AQVS.json`);
      if (!aqvsABIResponse.ok) throw new Error(ERRORS.abi_request_failed);
      aqvsABI = await aqvsABIResponse.json();

      const aqvsTokensABIResponse = await AQVS.fetch(`${env.proxy}/artifacts/AQVSTokens.json`);
      if (!aqvsTokensABIResponse.ok) throw new Error(ERRORS.abi_request_failed);
      tokensABI = await aqvsTokensABIResponse.json();

      const aqvsSpaceABIResponse = await AQVS.fetch(`${env.proxy}/artifacts/AQVSSpace.json`);
      if (!aqvsSpaceABIResponse.ok) throw new Error(ERRORS.abi_request_failed);
      spaceABI = await aqvsSpaceABIResponse.json();

      AQVS.setABI({ aqvsABI, tokensABI, spaceABI });
    }

    const AQVSContract = AQVS.contract(aqvsABI);
    AQVSContract.setProvider(AQVS.web3.currentProvider);
    AQVSContract.setNetwork(env.networkId);
    const aqvs = await AQVSContract.deployed();

    const AQVSTokenContract = AQVS.contract(tokensABI);
    AQVSTokenContract.setProvider(AQVS.web3.currentProvider);
    AQVSTokenContract.setNetwork(env.networkId);
    const tokens = await AQVSTokenContract.at(await aqvs.tokens());

    AQVS.contracts = { aqvs, tokens };
  },

  units: {
    kb: 1000,
    mb: 1000 * 1000,
    gb: 1000 * 1000 * 1000,
  },

  utils: {
    ensureBigNumber: (number) => {
      if (AQVS.web3.utils.isBN(number)) return number;
      return AQVS.web3.utils.toBN(number);
    }
  },

  sessions: {
    requestNonce: async () => {
      const env = ENVIRONMENTS[AQVS.env];
      return AQVS.fetch(
        `${env.proxy}/nonce`,
        { method: 'post' }
      );
    },

    signNonce: async (publicAddress, nonce) => {
      publicAddress = publicAddress.toLowerCase();
      return (await AQVS.web3.eth.personal.sign(
        nonce,
        publicAddress,
        '' // MetaMask will ignore the password argument here
      ));
    },

    makeSession: async (publicAddress) => {
      publicAddress = publicAddress.toLowerCase();
      const env = ENVIRONMENTS[AQVS.env];
      const { requestId, nonce } = await (await AQVS.sessions.requestNonce()).json();
      const signature = await AQVS.sessions.signNonce(publicAddress, nonce);
      return AQVS.fetch(
        `${env.proxy}/session?requestId=${requestId}&publicAddress=${publicAddress}&signature=${signature}`,
        { credentials: 'include' }
      );
    },

    currentSession: async (cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/session`, options);
    },

    flushSession: async (cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include', method: 'delete' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/session`, options);
    },
  },

  spaces: {
    getSpaceById: async (spaceId) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      const spaceAddress = await AQVS.contracts.aqvs.spacesById(spaceId);
      if (spaceAddress === "0x0000000000000000000000000000000000000000") return null;
      return await AQVS.spaces.getSpaceByAddress(spaceAddress);
    },

    getSpaceByAddress: async (spaceAddress) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      const sanitizedSpaceAddress = `${spaceAddress}`.toLowerCase();
      if (sanitizedSpaceAddress === "0x0000000000000000000000000000000000000000") return null;
      if (AQVS.spaceContracts[sanitizedSpaceAddress]) {
        return AQVS.spaceContracts[sanitizedSpaceAddress];
      }
      const AQVSSpaceContract = AQVS.contract(AQVS.ABI.spaceABI)
      AQVSSpaceContract.setProvider(AQVS.web3.currentProvider);
      AQVSSpaceContract.setNetwork(ENVIRONMENTS[AQVS.env].networkId);
      AQVS.spaceContracts[sanitizedSpaceAddress] =
        await AQVSSpaceContract.at(sanitizedSpaceAddress)
      return AQVS.spaceContracts[sanitizedSpaceAddress];
    },

    canModifySpace: async (spaceContract, publicAddress) => {
      publicAddress = publicAddress || (await AQVS.web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return ((await spaceContract.creator()).toLowerCase() === publicAddress);
    },

    canAccessSpace: async (spaceContract, publicAddress) => {
      publicAddress = publicAddress || (await AQVS.web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      if (await AQVS.spaces.canModifySpace(spaceContract, publicAddress)) return true;
      return (await AQVS.contracts.tokens.balanceOf.call(
        publicAddress,
        (await spaceContract.id()).toString()
      ) > 0);
    },

    getSpaceIdsCreatedBy: async (publicAddress) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      publicAddress = publicAddress || (await AQVS.web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return (await AQVS.contracts.aqvs.spaceIdsCreatedBy(publicAddress));
    },

    getSpaceIdsOwnedBy: async (publicAddress) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      publicAddress = publicAddress || (await AQVS.web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return (await AQVS.contracts.aqvs.spaceIdsOwnedBy(publicAddress));
    },

    remainingSupply: async (spaceContract) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      const spaceId = await spaceContract.id();
      return await AQVS.contracts.aqvs.remainingSupply(spaceId);
    },

    spaceFees: async (spaceContract) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      const spaceId = await spaceContract.id();
      return await AQVS.contracts.aqvs.spaceFees(spaceId);
    },

    accessSpace: async (spaceContract) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      const publicAddress = (await AQVS.web3.eth.getCoinbase()).toLowerCase();
      const spaceId = await spaceContract.id();
      const value = await spaceContract.accessPriceInWei();
      return await AQVS.contracts.aqvs.accessSpace.sendTransaction(spaceId, {
        from: publicAddress,
        value
      });
    },

    // TODO: Add spaceFees() method

    getSpaceContents: async (spaceId, cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/spaces/${spaceId}`, options);
    },

    getSpaceMetadata: async (spaceId, cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/space-metadata/${spaceId}`, options);
    },
  },

  creators: {
    estimateCostToMintSpaceInWei: async (spaceCapacityInBytes) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      return (await AQVS.contracts.aqvs.weiCostToMintSpace(spaceCapacityInBytes));
    },

    estimateSpaceAccessFeesInWei: async (
      initialSupply,
      spaceCapacityInBytes,
      accessPriceInWei
    ) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      initialSupply = AQVS.utils.ensureBigNumber(initialSupply);
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      accessPriceInWei = AQVS.utils.ensureBigNumber(accessPriceInWei);
      return (await AQVS.contracts.aqvs.estimateSpaceFees(
        initialSupply,
        spaceCapacityInBytes,
        accessPriceInWei
      ));
    },

    giftSpaceAccess: async (spaceId, gifteeAddress) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      return await AQVS.contracts.aqvs.giftSpaceAccess.sendTransaction(
        spaceId,
        gifteeAddress,
        {
          from: (await AQVS.web3.eth.getCoinbase()).toLowerCase()
        }
      );
    },

    addSpaceCapacityInBytes: async (spaceId, spaceCapacityInBytes) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      return await AQVS.contracts.aqvs.addSpaceCapacityInBytes.sendTransaction(
        spaceId,
        spaceCapacityInBytes,
        {
          from: (await AQVS.web3.eth.getCoinbase()).toLowerCase(),
          value: (await AQVS.contracts.aqvs.weiCostToMintSpace(spaceCapacityInBytes))
        }
      );
    },

    mintSpace: async (
      initialSupply,
      spaceCapacityInBytes,
      accessPriceInWei,
      purchasable
    ) => {
      if (!AQVS.contracts) await AQVS.initContracts();
      initialSupply = AQVS.utils.ensureBigNumber(initialSupply);
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      accessPriceInWei = AQVS.utils.ensureBigNumber(accessPriceInWei);

      return await AQVS.contracts.aqvs.mintSpace.sendTransaction(
        initialSupply,
        spaceCapacityInBytes,
        accessPriceInWei,
        purchasable,
        {
          from: (await AQVS.web3.eth.getCoinbase()).toLowerCase(),
          value: (await AQVS.contracts.aqvs.weiCostToMintSpace(spaceCapacityInBytes))
        }
      );
    },

    setSpaceMetadata: async (spaceId, data, cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      const options = {
        credentials: 'include',
        method: 'put',
        body: JSON.stringify(data),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      };
      if (cookie) { options.headers.cookie = cookie }
      return AQVS.fetch(`${env.proxy}/space-metadata/${spaceId}`, options);
    },

    uploadFilesToSpace: async (
      spaceId,
      formData,
      cookie
    ) => {
      // TODO: Test this works in Node (without setting boundary)?
      const env = ENVIRONMENTS[AQVS.env];
      let options = { method: 'put', body: formData, credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/spaces/${spaceId}`, options);
    },

    deleteFileInSpace: async (
      spaceId,
      filePath,
      cookie
    ) => {
      filePath = filePath.startsWith("/") ? filePath : `/${filePath}`;
      if (filePath.length === 1) throw new Error(ERRORS.delete_filepath_empty);
      const env = ENVIRONMENTS[AQVS.env];
      let options = { method: 'delete', credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/spaces/${spaceId}${filePath}`, options);
    },

    deleteAllFilesInSpace: async (
      spaceId,
      cookie
    ) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { method: 'delete', credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.proxy}/spaces/${spaceId}`, options);
    }
  },

  browser: {
    closePaywall: async () => {
      const paywall = document.querySelector('.AQVSPaywall--modal');
      if (paywall) {
        paywall.classList.remove('AQVSPaywall--show-modal');
      }
    },

    invokePaywall: async (spaceId, options = {}) => {
      const spaceContract = await AQVS.spaces.getSpaceById(spaceId);
      const spaceMetadata = await (await AQVS.spaces.getSpaceMetadata(spaceId)).json();
      const priceInEth = AQVS.web3.utils.fromWei(
        await spaceContract.accessPriceInWei(),
        'ether'
      );

      return new Promise((resolve, reject) => {
        if (!spaceContract) return reject(new Error(ERRORS.space_does_not_exist));

        let paywall = document.querySelector('.AQVSPaywall--modal');
        if (!paywall) {
          document.getElementsByTagName('body')[0].appendChild(
            document.createRange().createContextualFragment(paywallHTML)
          );
          paywall = document.querySelector('.AQVSPaywall--modal');
        }

        // Setup Listeners
        if (!paywall.hasClickListener) {
          paywall.addEventListener('click', function hideModalIfClickBackdrop(e) {
            if (e.target.classList.contains('AQVSPaywall--modal')) {
              paywall.classList.remove('AQVSPaywall--show-modal');
            }
          });
          paywall.hasClickListener = true;
        }

        paywall.querySelectorAll('.AQVSPaywall--close').forEach(el => {
          if (!el.hasClickListener) {
            el.addEventListener('click', function hideModal() {
              paywall.classList.remove('AQVSPaywall--show-modal');
            });
            el.hasClickListener = true;
          }
        });

        paywall.querySelectorAll('.AQVSPaywall--pay-button').forEach(el => {
          if (!el.hasClickListener) {
            el.addEventListener('click', async function attemptPayment() {
              try {
                el.disabled = true;
                await AQVS.spaces.accessSpace(spaceContract);
                options && options.callback && options.callback();
              } catch(e) {
                el.disabled = false;
                let msg = e.message || 'Unknown error';
                if (msg.includes('revert already_owns_space')) {
                  msg = 'Wallet already owns this NFT';
                } else if (msg.includes('User denied transaction signature.')) {
                  msg = 'Wallet did not accept the transaction';
                } else {
                  console.log(msg);
                  msg = 'Unknown error';
                }
                paywall.querySelectorAll('.AQVSPaywall--error').forEach(el => {
                  el.innerHTML = msg;
                  el.classList.remove('AQVSPaywall--display-none');
                });
                options && options.callback && options.callback(e);
              } finally {
                el.disabled = false;
              }
            });
            el.hasClickListener = true;
          }
        });

        // Setup Data Vars
        // TODO: only do this if we're not currently loading
        paywall.querySelectorAll('.AQVSPaywall--error').forEach(el => {
          el.innerHTML = "";
          el.classList.add('AQVSPaywall--display-none');
        });

        const name = spaceMetadata.name || "No Name Set";
        paywall.querySelectorAll('.AQVSPaywall--name').forEach(el => {
          el.innerHTML = name;
        });

        const description = spaceMetadata.description || '';
        paywall.querySelectorAll('.AQVSPaywall--description').forEach(el => {
          el.innerHTML = description || "";
          if (description.length) {
            el.classList.remove('AQVSPaywall--display-none');
          } else {
            el.classList.add('AQVSPaywall--display-none');
          }
        });

        const image = spaceMetadata.image || '';
        paywall.querySelectorAll('.AQVSPaywall--preview').forEach(el => {
          el.src = image;
          if (image.length) {
            el.classList.remove('AQVSPaywall--display-none');
          } else {
            el.classList.add('AQVSPaywall--display-none');
          }
        });

        paywall.querySelectorAll('.AQVSPaywall--eth-price').forEach(el => {
          el.innerHTML = priceInEth;
        });

        if (options && options.contextImage) {
          paywall.querySelectorAll('.AQVSPaywall--context img').forEach(el => {
            el.src = options.contextImage;
            el.classList.remove('AQVSPaywall--display-none');
          });
          paywall.querySelectorAll('.AQVSPaywall--context span').forEach(el => {
            el.innerHTML = "";
            el.classList.add('AQVSPaywall--display-none');
          });
        } else if (options && options.contextText) {
          paywall.querySelectorAll('.AQVSPaywall--context img').forEach(el => {
            el.src = "";
            el.classList.add('AQVSPaywall--display-none');
          });
          paywall.querySelectorAll('.AQVSPaywall--context span').forEach(el => {
            el.innerHTML = options.contextText;
            el.classList.remove('AQVSPaywall--display-none');
          });
        }

        setTimeout(() => {
          paywall.classList.add('AQVSPaywall--show-modal');
          resolve(paywall);
        }, 0);
      });
    }
  },
};

// If the user is in the browser, auto-bind fetch
if (typeof window !== 'undefined' && typeof window.fetch !== 'undefined') {
  AQVS.setFetch(window.fetch.bind(window));
}

export default AQVS;
