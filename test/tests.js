const test = require('ava');
const AQVS = require('../');
const Web3 = require('web3');
const HDWalletProvider = require('@truffle/hdwallet-provider');
const fetch = require('node-fetch');
const fs = require('fs');
const FormData = require('form-data');

const Accounts = {
  DEPLOYER: 0,
  CREATOR: 1,
  BUYER: 2
};

const FIVE_MB = 5 * 1000 * 1000;
const GANACHE_TESTING_MNEMONIC =
  'style fiber prison rally chaos bundle audit ordinary treat twice nut merry';
const GANACHE_ADDRESS = `http://localhost:8545`;
var SPACE_ADDRESS;

const asUserAccount = async (index, callback) => {
  try {
    const provider = new HDWalletProvider({
      mnemonic: {
        phrase: GANACHE_TESTING_MNEMONIC
      },
      providerOrUrl: GANACHE_ADDRESS,
      addressIndex: index,
      numberOfAddresses: 3,
    });

    AQVS.setTruffleContract(require('@truffle/contract'));
    await AQVS.setEnv('dev');
    await AQVS.setFetch(fetch);
    const web3 = new Web3(provider);
    await AQVS.setWeb3(web3);

    const publicAddress = (await web3.eth.getCoinbase()).toLowerCase();
    await callback(publicAddress);
    provider.engine.stop();
  } catch (e) {
    console.log(e);
    throw e;
  }
};


test('it can manage viewer sessions', async t => {
  await asUserAccount(Accounts.CREATOR , async publicAddress => {
    const web3 = await AQVS.getWeb3();

    // Make a session
    const makeSessionResponse = await AQVS.sessions.makeSession(
      publicAddress,
      "Please sign below to prove your identity (${nonce})"
    );
    const currentSession = await makeSessionResponse.json();
    let cookie = makeSessionResponse.headers.get('set-cookie');
    t.is(!!currentSession.publicAddress, true);

    // Fetch a session (Node style, with cookie)
    const fetchSessionResponse = await AQVS.sessions.currentSession(cookie);
    const fetchedSession = await fetchSessionResponse.json();
    cookie = makeSessionResponse.headers.get('set-cookie');
    t.is(!!currentSession.publicAddress, true);

    // Flush a session (Node style, with cookie)
    const flushSessionResponse = await AQVS.sessions.flushSession(cookie);
    const flushedSession = await flushSessionResponse.json();
    const unsetCookie = flushSessionResponse.headers.get('set-cookie');
    t.is(unsetCookie, 'aqvs.session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    t.is(flushedSession.status, 'ok');

    // The old cookie can no longer fetch a session
    const attemptFetchSessionResponse = await AQVS.sessions.currentSession(cookie);
    const attemptFetchSession = await attemptFetchSessionResponse.json();
    t.is(attemptFetchSession.error.message, 'session_expired_or_missing');
  });

});

test('it can mint spaces', async t => {
  t.timeout(1000 * 60 * 5); // 5 minutes

  await asUserAccount(Accounts.CREATOR, async publicAddress => {
    const web3 = await AQVS.getWeb3();
    const initialBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(publicAddress)
    );

    await AQVS.init();
    const aqvsInitialBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(AQVS.controllerContract.address)
    );

    // Estimate the weiCostToMintSpace
    const weiCostToMintSpace = await AQVS.creators.estimateCostToMintSpaceInWei(
      AQVS.units.mb * 5,
    );

    // It can mint a space
    const tx = await AQVS.creators.mintSpace(
      3,
      AQVS.units.mb * 5,
      web3.utils.toWei('1', 'ether'),
      false
    );
    const txGasUsed =
      web3.utils.toBN(tx.receipt.cumulativeGasUsed);
    const txGasPrice =
      web3.utils.toBN((await web3.eth.getTransaction(tx.tx)).gasPrice);
    const txCost =
      txGasUsed.mul(txGasPrice);

    const mintEvent = tx.logs.find(l => l.event === 'DidMintSpace');
    SPACE_ADDRESS = mintEvent.args.spaceAddress;
    t.is(!!SPACE_ADDRESS, true);

    const postBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(publicAddress)
    );
    t.is(
      postBalance.toString(),
      initialBalance.sub(weiCostToMintSpace).sub(txCost).toString()
    );

    const aqvsPostBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(AQVS.controllerContract.address)
    );
    t.is(
      aqvsPostBalance.toString(),
      aqvsInitialBalance.add(weiCostToMintSpace).toString()
    );

    // The created space is now owned by the creator
    const createdSpaceIds =
      (await AQVS.spaces.getSpacesCreatedBy(publicAddress)).map(bn => bn.toString());
    t.is(createdSpaceIds.includes(SPACE_ADDRESS), true);

    // Load the Space Contract
    const spaceContract = await AQVS.spaces.getSpaceByAddress(SPACE_ADDRESS);

    // The AQVS user canModifySpace, but others can not
    t.is((await AQVS.spaces.canModifySpace(spaceContract)), true);
    t.is((await AQVS.spaces.canModifySpace(spaceContract, publicAddress)), true);
    t.is((await AQVS.spaces.canModifySpace(
      spaceContract,
      web3.currentProvider.addresses[1]
    )), false);

    // The AQVS user canAccessSpace, but others can not
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), true);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract, publicAddress)), true);
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      web3.currentProvider.addresses[1]
    )), false);

    // The AQVS user needs a session to update metadata and files
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    const currentSession = await makeSessionResponse.json();
    let cookie = makeSessionResponse.headers.get('set-cookie');
    t.is(!!currentSession.publicAddress, true);

    // TODO: Test me
    //const spaceTokenResponse =
    //  await AQVS.creators.makeSpaceToken(SPACE_ADDRESS, {
    //    metadata: ['write']
    //  });
    //const { token } = await spaceTokenResponse.json();

    // The AQVS creator can setSpaceMetadata (which also serves as the ERC721 token metadata)
    const response = await AQVS.creators.setSpaceMetadata(SPACE_ADDRESS, {
      name: 'Rainbow Chan',
      description: 'Spacings',
      image: 'https://f4.bcbits.com/img/a0195171096_16.jpg'
    });
    t.is((await response.json()).status, 'ok');

    // The anyone can getSpaceMetadata (which also serves as the ERC1155 token metadata)
    const getSpaceMetadataResponse = await AQVS.spaces.getSpaceMetadata(SPACE_ADDRESS);
    const metadata = await getSpaceMetadataResponse.json();
    t.is(metadata.name, 'Rainbow Chan');
    t.is(metadata.description, 'Spacings');
    t.is(metadata.image, 'https://f4.bcbits.com/img/a0195171096_16.jpg');

    // The creator can manage cors for their space
    const addCorsOriginResponse = await AQVS.creators.addCorsOrigin(
      SPACE_ADDRESS,
      "example.com",
    );
    t.is(addCorsOriginResponse.status, 200);

    const addCorsOriginResponse2 = await AQVS.creators.addCorsOrigin(
      SPACE_ADDRESS,
      "example2.com",
    );
    t.is(addCorsOriginResponse2.status, 200);

    const getCorsOriginsResponse = await AQVS.creators.getCorsOrigins(
      SPACE_ADDRESS,
    );
    t.is(getCorsOriginsResponse.status, 200);

    const corsOrigins = (await getCorsOriginsResponse.json()).origins;
    t.is(corsOrigins.includes("example.com"), true);
    t.is(corsOrigins.includes("example2.com"), true);
    t.is(corsOrigins.length, 2);

    const removeCorsOriginResponse = await AQVS.creators.removeCorsOrigin(
      SPACE_ADDRESS,
      "example.com",
    );
    t.is(removeCorsOriginResponse.status, 200);

    const getCorsOriginsResponse2 = await AQVS.creators.getCorsOrigins(
      SPACE_ADDRESS,
    );
    t.is(getCorsOriginsResponse2.status, 200);
    const corsOrigins2 = (await getCorsOriginsResponse2.json()).origins;
    t.is(corsOrigins2.includes("example.com"), false);
    t.is(corsOrigins2.includes("example2.com"), true);
    t.is(corsOrigins2.length, 1);

    // The AQVS Creator can deleta all files in the Space
    const deleteAllFilesInSpaceResponse =
      await AQVS.creators.deleteAllFilesInSpace(SPACE_ADDRESS);
    t.is((await deleteAllFilesInSpaceResponse.json()).status, 'ok');

    const getSpaceContentsResponseWithCookie = await AQVS.spaces.getSpaceContents(SPACE_ADDRESS, cookie);
    const contentsWithCookie = await getSpaceContentsResponseWithCookie.json();
    t.is(contentsWithCookie.length, 0);

    const getSpaceContentsResponseWithToken = await AQVS.spaces.getSpaceContents(SPACE_ADDRESS);
    const contentsWithToken = await getSpaceContentsResponseWithToken.json();
    t.is(contentsWithToken.length, 0);

    // Test an Upload
    const formData = new FormData();
    formData.append('/pixel.png', fs.createReadStream('./test/pixel.png'));
    const uploadFileResponse = await AQVS.creators.uploadFilesToSpace(SPACE_ADDRESS, formData);
    t.is(
      (await uploadFileResponse.json()).success[0],
      '/pixel.png'
    );

  });
});

test('it can access spaces', async t => {
  await asUserAccount(Accounts.BUYER, async (publicAddress) => {
    const web3 = await AQVS.getWeb3();
    const spaceContract = await AQVS.spaces.getSpaceByAddress(SPACE_ADDRESS);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), false);

    const accessSpaceTx = await AQVS.spaces.accessSpace(spaceContract);
    t.is(accessSpaceTx.receipt.stack.includes("revert not_purchasable"), true);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), false);

    const setPurchasableTx = await spaceContract.setPurchasable(true, { from: publicAddress });
    t.is(setPurchasableTx.receipt.stack.includes("revert only_creator"), true);

    // The AQVS user needs a session
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    const currentSession = await makeSessionResponse.json();
    let cookie = makeSessionResponse.headers.get('set-cookie');
    t.is(!!currentSession.publicAddress, true);

    const getSpaceContentsResponse = await AQVS.spaces.getSpaceContents(SPACE_ADDRESS, cookie);
    t.is((await getSpaceContentsResponse.json()).error.message, 'unauthorized');

    // Downloads don't work
    const gateway = AQVS.ENVIRONMENTS[AQVS.env].gateway;
    const fetchFileResponse = await fetch(`${gateway}/spaces/${SPACE_ADDRESS}/pixel.png`, {
      method: 'GET',
      credentials: 'include',
      headers: { cookie }
    });
    t.is(fetchFileResponse.status, 500);

    // non-creator Can not load cors list
    const getCorsOriginsResponse = await AQVS.creators.getCorsOrigins(
      SPACE_ADDRESS,
      cookie
    );
    t.is(getCorsOriginsResponse.status, 500);
  });

  await asUserAccount(Accounts.CREATOR, async () => {
    const web3 = await AQVS.getWeb3();
    const publicAddress = (await web3.eth.getCoinbase()).toLowerCase();
    const spaceContract = await AQVS.spaces.getSpaceByAddress(SPACE_ADDRESS);
    const tx = await spaceContract.setPurchasable(true, { from: publicAddress });
    // TODO: Add event to search for
  });

  await asUserAccount(Accounts.BUYER, async publicAddress => {
    const web3 = await AQVS.getWeb3();
    await AQVS.init();
    const aqvsInitialBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(AQVS.controllerContract.address)
    );

    const spaceContract = await AQVS.spaces.getSpaceByAddress(SPACE_ADDRESS);
    const tx = await AQVS.spaces.accessSpace(spaceContract);
    const accessEvent = tx.logs.find(l => l.event === 'DidAccessSpace');
    const spaceAddress = accessEvent.args.spaceAddress;
    t.is(spaceAddress, spaceContract.address);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), true);

    // The created space is now owned by the buyer
    const ownedSpaceIds =
      (await AQVS.spaces.getSpacesOwnedBy(publicAddress)).map(bn => bn.toString());
    t.is(ownedSpaceIds.includes(SPACE_ADDRESS), true);

    const remainingSupply = await AQVS.spaces.remainingSupply(spaceContract);
    t.is(remainingSupply.toNumber(), 2);

    const aqvsPostBalance = AQVS.utils.ensureBigNumber(
      await web3.eth.getBalance(AQVS.controllerContract.address)
    );

    t.is(
      (await AQVS.spaces.spaceFees(
        spaceContract
      )).toString(),
      (await AQVS.creators.estimateSpaceAccessFeesInWei(
        web3.utils.toWei('1', 'ether'),
      )).toString()
    );

    t.is(
      aqvsPostBalance.toString(),
      aqvsInitialBalance.add(
        await AQVS.creators.estimateSpaceAccessFeesInWei(
          web3.utils.toWei('1', 'ether'),
        )
      ).toString()
    );

    // The AQVS user needs a session
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    let cookie = makeSessionResponse.headers.get('set-cookie');

    // Can access!
    const getSpaceContentsResponse = await AQVS.spaces.getSpaceContents(SPACE_ADDRESS, cookie);
    t.is((await getSpaceContentsResponse.json())[0].path, '/pixel.png');

    // Test downloading now works!
    const gateway = AQVS.ENVIRONMENTS[AQVS.env].gateway;
    const fetchFileResponse = await fetch(`${gateway}/spaces/${SPACE_ADDRESS}/pixel.png`, {
      method: 'GET',
      credentials: 'include',
      headers: { cookie }
    });
    t.is(fetchFileResponse.status, 200);
  });

  await asUserAccount(Accounts.CREATOR, async publicAddress => {
    const web3 = await AQVS.getWeb3();
    const spaceContract = await AQVS.spaces.getSpaceByAddress(SPACE_ADDRESS);

    // It can add delete an individual file
    const deleteFileInSpaceResponse =
      await AQVS.creators.deleteFileInSpace(SPACE_ADDRESS, '/pixel.png');
    t.is((await deleteFileInSpaceResponse.json()).status, 'ok');

    // It can add space capacity
    const addSpaceCapacityTx
      = await AQVS.creators.addSpaceCapacityInBytes(SPACE_ADDRESS, AQVS.units.mb * 1);
    const spaceCapacity = await spaceContract.spaceCapacityInBytes();
    t.is(spaceCapacity.toNumber(), AQVS.units.mb * 6);

    // It can gift space access
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      web3.currentProvider.addresses[2]
    )), false);

    const giftSpaceAccessTx = await AQVS.creators.giftSpaceAccess(
      SPACE_ADDRESS,
      web3.currentProvider.addresses[2]
    );
    const event = giftSpaceAccessTx.logs.find(l => l.event === 'DidGiftSpaceAccess');
    const spaceAddress = event.args.spaceAddress;
    t.is(spaceAddress, spaceContract.address);
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      web3.currentProvider.addresses[2]
    )), true);
  });

});
