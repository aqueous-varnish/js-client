import paywallHTML from './html/paywall';

const ERRORS = {
  no_web3_set: 'no_web3_set',
  wrong_network: 'wrong_network',
  abi_request_failed: 'abi_request_failed',
  delete_filepath_empty: 'delete_filepath_empty',
  space_does_not_exist: 'space_does_not_exist',
  invalid_environment: 'invalid_environment',
  no_truffle_contract_set: 'no_truffle_contract_set',
  template_string_invalid: 'template_string_does_not_contain_nonce'
};

const ENVIRONMENTS = {
  'dev': {
    gateway: 'http://localhost:3000',
    networkId: 5777
  },
  'ropsten': {
    gateway: 'https://ropsten.aqueousvarni.sh',
    networkId: 3
  },
  'rinkeby': {
    gateway: 'https://rinkeby.aqueousvarni.sh',
    networkId: 4
  },
  'mainnet': {
    gateway: 'https://mainnet.aqueousvarni.sh',
    networkId: 1
  }
};

const makeAdHocSpaceToken = async (spaceAddress, permissions) => {
  const spaceTokenResponse =
    await AQVS.creators.makeSpaceToken(spaceAddress, permissions);
  if (spaceTokenResponse > 299) return spaceTokenResponse;
  const spaceTokenData = await spaceTokenResponse.json();
  return spaceTokenData.token;
};

const AQVS = {
  ENVIRONMENTS,
  ERRORS,

  env: 'mainnet',
  setEnv: async (env) => {
    if (!Object.keys(ENVIRONMENTS).includes(env)) throw new Error(ERRORS.invalid_environment);
    AQVS.env = env;
    if (!!AQVS.controllerContract) await AQVS.init();
  },

  clientName: 'system',
  setClientName: (clientName) => {
    AQVS.clientName = clientName;
  },

  _web3: null,
  getWeb3: async () => {
    if (!AQVS._web3) throw new Error(ERRORS.no_web3_set);
    const env = ENVIRONMENTS[AQVS.env];
    const networkId = await AQVS._web3.eth.net.getId();
    if (networkId !== env.networkId) throw new Error(ERRORS.wrong_network);
    return AQVS._web3;
  },
  setWeb3: async (web3) => {
    const env = ENVIRONMENTS[AQVS.env];
    const networkId = await web3.eth.net.getId();
    if (networkId !== env.networkId) throw new Error(ERRORS.wrong_network);
    AQVS._web3 = web3;
    if (!!AQVS.controllerContract) await AQVS.init();
    AQVS.spaceContracts = {};
    return web3;
  },

  fetch: null,
  setFetch: (fetch) => {
    AQVS.fetch = fetch;
  },

  ABI: {},
  setABI: (abi) => {
    AQVS.ABI = abi;
  },

  truffleContract: null,
  setTruffleContract: (truffleContract) => {
    AQVS.truffleContract = truffleContract;
  },

  // TODO: Nest
  controllerContract: null,
  spaceContracts: {},

  init: async () => {
    const web3 = await AQVS.getWeb3();
    if (!AQVS.truffleContract) throw new Error(ERRORS.no_truffle_contract_set);
    const env = ENVIRONMENTS[AQVS.env];

    let { aqvsABI, spaceABI } = AQVS.ABI;
    if (!aqvsABI || !spaceABI) {
      const aqvsABIResponse = await AQVS.fetch(`${env.gateway}/artifacts/AQVSController.json`);
      if (!aqvsABIResponse.ok) throw new Error(ERRORS.abi_request_failed);
      aqvsABI = await aqvsABIResponse.json();

      const aqvsSpaceABIResponse = await AQVS.fetch(`${env.gateway}/artifacts/AQVSSpaceV1.json`);
      if (!aqvsSpaceABIResponse.ok) throw new Error(ERRORS.abi_request_failed);
      spaceABI = await aqvsSpaceABIResponse.json();

      AQVS.setABI({ aqvsABI, spaceABI });
    }

    const AQVSContract = AQVS.truffleContract(aqvsABI);
    AQVSContract.setProvider(web3.currentProvider);
    AQVSContract.setNetwork(env.networkId);
    AQVS.controllerContract = await AQVSContract.deployed();
    return AQVS.controllerContract;
  },

  units: {
    kb: 1000,
    mb: 1000 * 1000,
    gb: 1000 * 1000 * 1000,
  },

  utils: {
    signMessage: async (publicAddress, nonce) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return (await web3.eth.personal.sign(
        nonce,
        publicAddress,
        '' // MetaMask will ignore the password argument here
      ));
    },

    interpolate: (str, vars) => {
      return str.replace(/\${([^}]+)}/g,(m,p)=>p.split('.').reduce((a,f)=>a?a[f]:undefined,vars)??'');
    },
    ensureBigNumber: (number) => {
      if (AQVS._web3.utils.isBN(number)) return number;
      return AQVS._web3.utils.toBN(number);
    }
  },

  sessions: {
    requestNonce: async (publicAddress) => {
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      const env = ENVIRONMENTS[AQVS.env];
      return AQVS.fetch(
        `${env.gateway}/nonce`,
        {
          method: 'post',
          body: JSON.stringify({ publicAddress }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
        }
      );
    },

    makeSession: async (publicAddress, templateString) => {
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      const env = ENVIRONMENTS[AQVS.env];
      const { nonce } = await (await AQVS.sessions.requestNonce(publicAddress)).json();

      let message;
      if (!!templateString) {
        if (!templateString.includes("${nonce}")) {
          throw new Error(ERRORS.template_string_invalid);
        }
        message = AQVS.utils.interpolate(templateString, { nonce });
      } else {
        message = nonce;
      }

      const signature =
        await AQVS.utils.signMessage(publicAddress, message);
      return AQVS.fetch(
        `${env.gateway}/session`,
        {
          credentials: 'include',
          method: 'post',
          body: JSON.stringify({
            publicAddress,
            message,
            signature
          }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
        }
      );
    },

    currentSession: async (cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.gateway}/session`, options);
    },

    flushSession: async (cookie) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include', method: 'delete' };
      if (cookie) { options = Object.assign(options, { headers: { cookie }}); }
      return AQVS.fetch(`${env.gateway}/session`, options);
    },
  },

  spaces: {
    makeGatewayFilepaths: (spaceAddress, paths) => {
      const env = ENVIRONMENTS[AQVS.env];
      return paths.map(p => {
        return `${env.gateway}/${spaceAddress}${p.path.startsWith("/") ? p.path : "/" + p.path}`;
      });
    },

    getSpaceByAddress: async (spaceAddress) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      const { spaceABI } = AQVS.ABI;
      if (!spaceABI) throw new Error(ERRORS.no_abi_set);
      const { networkId } = ENVIRONMENTS[AQVS.env];

      const sanitizedSpaceAddress = `${spaceAddress}`.toLowerCase();
      if (sanitizedSpaceAddress === "0x0000000000000000000000000000000000000000") {
        throw new Error(ERRORS.space_does_not_exist);
      }

      AQVS.spaceContracts[networkId] = AQVS.spaceContracts[networkId] || {};
      if (AQVS.spaceContracts[networkId][sanitizedSpaceAddress]) {
        return AQVS.spaceContracts[networkId][sanitizedSpaceAddress];
      }

      const AQVSSpaceContract = AQVS.truffleContract(spaceABI);
      AQVSSpaceContract.setProvider(web3.currentProvider);
      AQVSSpaceContract.setNetwork(networkId);
      AQVS.spaceContracts[networkId][sanitizedSpaceAddress]
        = await AQVSSpaceContract.at(sanitizedSpaceAddress);
      return AQVS.spaceContracts[networkId][sanitizedSpaceAddress];
    },

    canModifySpace: async (spaceContract, publicAddress) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return ((await spaceContract.creator()).toLowerCase() === publicAddress);
    },

    canAccessSpace: async (spaceContract, publicAddress) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      if (await AQVS.spaces.canModifySpace(spaceContract, publicAddress)) return true;
      return (await spaceContract.balanceOf.call(publicAddress) > 0);
    },

    getSpacesCreatedBy: async (publicAddress) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return (await AQVS.controllerContract.spacesCreatedBy(publicAddress));
    },

    getSpacesOwnedBy: async (publicAddress) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      return (await AQVS.controllerContract.spacesOwnedBy(publicAddress));
    },

    remainingSupply: async (spaceContract) => {
      if (!AQVS.controllerContract) await AQVS.init();
      return await AQVS.controllerContract.remainingSupply(spaceContract.address);
    },

    spaceFees: async (spaceContract) => {
      if (!AQVS.controllerContract) await AQVS.init();
      return await AQVS.controllerContract.spaceFees(spaceContract.address);
    },

    accessSpace: async (spaceContract) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      const publicAddress = (await web3.eth.getCoinbase()).toLowerCase();
      const value = await spaceContract.accessPriceInWei();
      return await AQVS.controllerContract.accessSpace.sendTransaction(
        spaceContract.address,
        {
          from: publicAddress,
          value
        }
      );
    },

    getSpaceContents: async (spaceAddress, cookieOrToken) => {
      const env = ENVIRONMENTS[AQVS.env];
      const options = { credentials: 'include', headers: {} };
      if (cookieOrToken) {
        if (cookieOrToken.startsWith("aqvs.session")) {
          options.headers[`cookie`] = cookieOrToken;
        } else {
          options.headers[`Authorization`] = `Token ${cookieOrToken}`;
        }
      } else {
        const token = await makeAdHocSpaceToken(spaceAddress, {
          files: ['read']
        });
        options.headers[`Authorization`] = `Token ${token}`;
      }
      return AQVS.fetch(
        `${env.gateway}/spaces/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    getSpaceMetadata: async (spaceAddress) => {
      const env = ENVIRONMENTS[AQVS.env];
      return AQVS.fetch(
        `${env.gateway}/space-metadata/${spaceAddress.toLowerCase()}`,
      );
    },
  },

  creators: {
    makeSpaceToken: async (
      spaceAddress,
      permissions,
      client,
      publicAddress
    ) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();
      const challengeResponse =
        await AQVS.creators.makeSpaceTokenChallenge(
          spaceAddress,
          permissions,
          (client || AQVS.clientName),
          publicAddress
        );
      if (challengeResponse.status > 299) return challengeResponse;
      const { challenge } = await challengeResponse.json();
      const signature =
        await AQVS.utils.signMessage(publicAddress, challenge);
      return AQVS.creators.completeSpaceTokenChallenge(
        spaceAddress,
        signature,
        publicAddress
      );
    },

    makeSpaceTokenChallenge: async (
      spaceAddress,
      permissions,
      client,
      publicAddress
    ) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();

      const env = ENVIRONMENTS[AQVS.env];
      return AQVS.fetch(
        `${env.gateway}/space-tokens/${spaceAddress.toLowerCase()}/nonce`,
        {
          method: 'POST',
          body: JSON.stringify({
            publicAddress,
            permissions,
            client: (client || AQVS.clientName)
          }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
        }
      );
    },

    completeSpaceTokenChallenge: async (
      spaceAddress,
      signature,
      publicAddress
    ) => {
      const web3 = await AQVS.getWeb3();
      publicAddress = publicAddress || (await web3.eth.getCoinbase());
      publicAddress = publicAddress.toLowerCase();

      const env = ENVIRONMENTS[AQVS.env];
      return AQVS.fetch(
        `${env.gateway}/space-tokens/${spaceAddress.toLowerCase()}`,
        {
          method: 'POST',
          body: JSON.stringify({
            publicAddress,
            signature
          }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
        }
      );
    },

    estimateCostToMintSpaceInWei: async (spaceCapacityInBytes) => {
      if (!AQVS.controllerContract) await AQVS.init();
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      return (await AQVS.controllerContract.weiCostToMintSpace(spaceCapacityInBytes));
    },

    estimateSpaceAccessFeesInWei: async (
      accessPriceInWei
    ) => {
      if (!AQVS.controllerContract) await AQVS.init();
      accessPriceInWei = AQVS.utils.ensureBigNumber(accessPriceInWei);
      return (await AQVS.controllerContract.estimateSpaceFees(
        accessPriceInWei
      ));
    },

    giftSpaceAccess: async (spaceAddress, gifteeAddress) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      return await AQVS.controllerContract.giftSpaceAccess.sendTransaction(
        spaceAddress.toLowerCase(),
        gifteeAddress,
        {
          from: (await web3.eth.getCoinbase()).toLowerCase()
        }
      );
    },

    getCorsOrigins: async (spaceAddress, token) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = { credentials: 'include', headers: {} };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          cors: ['read']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/space-cors/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    addCorsOrigin: async (spaceAddress, origin, token) => {
      const env = ENVIRONMENTS[AQVS.env];
      const options = {
        credentials: 'include',
        method: 'put',
        body: JSON.stringify({ origin }),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          cors: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/space-cors/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    removeCorsOrigin: async (spaceAddress, origin, token) => {
      const env = ENVIRONMENTS[AQVS.env];
      const options = {
        credentials: 'include',
        method: 'delete',
        body: JSON.stringify({ origin }),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
      };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          cors: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/space-cors/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    addSpaceCapacityInBytes: async (spaceAddress, spaceCapacityInBytes) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      return await AQVS.controllerContract.addSpaceCapacityInBytes.sendTransaction(
        spaceAddress.toLowerCase(),
        spaceCapacityInBytes,
        {
          from: (await web3.eth.getCoinbase()).toLowerCase(),
          value: (await AQVS.controllerContract.weiCostToMintSpace(spaceCapacityInBytes))
        }
      );
    },

    mintSpace: async (
      initialSupply,
      spaceCapacityInBytes,
      accessPriceInWei,
      purchasable
    ) => {
      const web3 = await AQVS.getWeb3();
      if (!AQVS.controllerContract) await AQVS.init();
      initialSupply = AQVS.utils.ensureBigNumber(initialSupply);
      spaceCapacityInBytes = AQVS.utils.ensureBigNumber(spaceCapacityInBytes);
      accessPriceInWei = AQVS.utils.ensureBigNumber(accessPriceInWei);

      return await AQVS.controllerContract.mintSpace.sendTransaction(
        initialSupply,
        spaceCapacityInBytes,
        accessPriceInWei,
        purchasable,
        {
          from: (await web3.eth.getCoinbase()).toLowerCase(),
          value: (await AQVS.controllerContract.weiCostToMintSpace(spaceCapacityInBytes))
        }
      );
    },

    setSpaceMetadata: async (spaceAddress, data, token) => {
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
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          metadata: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/space-metadata/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    uploadFilesToSpace: async (
      spaceAddress,
      formData,
      token
    ) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = {
        method: 'put',
        body: formData,
        credentials: 'include',
        headers: {}
      };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          files: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/spaces/${spaceAddress.toLowerCase()}`,
        options
      );
    },

    deleteFileInSpace: async (
      spaceAddress,
      filePath,
      token
    ) => {
      filePath = filePath.startsWith("/") ? filePath : `/${filePath}`;
      if (filePath.length === 1) throw new Error(ERRORS.delete_filepath_empty);
      const env = ENVIRONMENTS[AQVS.env];
      let options = {
        method: 'delete',
        credentials: 'include',
        headers: {}
      };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          files: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/spaces/${spaceAddress.toLowerCase()}${filePath}`,
        options
      );
    },

    deleteAllFilesInSpace: async (
      spaceAddress,
      token
    ) => {
      const env = ENVIRONMENTS[AQVS.env];
      let options = {
        method: 'delete',
        credentials: 'include',
        headers: {}
      };
      if (!token) {
        token = await makeAdHocSpaceToken(spaceAddress, {
          files: ['write']
        });
      }
      options.headers[`Authorization`] = `Token ${token}`;
      return AQVS.fetch(
        `${env.gateway}/spaces/${spaceAddress.toLowerCase()}`,
        options
      );
    }
  },

  browser: {
    closePaywall: async () => {
      const paywall = document.querySelector('.AQVSPaywall--modal');
      if (paywall) {
        paywall.classList.remove('AQVSPaywall--show-modal');
      }
    },

    invokePaywall: async (spaceAddress, options = {}) => {
      const web3 = await AQVS.getWeb3();
      const spaceContract = await AQVS.spaces.getSpaceByAddress(spaceAddress);
      const spaceMetadata = await (await AQVS.spaces.getSpaceMetadata(spaceAddress)).json();
      const priceInEth = web3.utils.fromWei(
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
