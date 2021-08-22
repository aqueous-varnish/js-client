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
var SPACE_ID;

const asUserAccount = async (index, callback) => {
  try {
    const provider = new HDWalletProvider({
      mnemonic: {
        phrase: GANACHE_TESTING_MNEMONIC
      },
      providerOrUrl: GANACHE_ADDRESS,
      addressIndex: index
    });

    AQVS.setContract(require('@truffle/contract'));
    await AQVS.setEnv('dev');
    await AQVS.setFetch(fetch);
    const web3 = new Web3(provider);
    await AQVS.setWeb3(web3);
    const publicAddress = (await AQVS.web3.eth.getCoinbase()).toLowerCase();

    await callback(publicAddress);
    provider.engine.stop();
  } catch (e) {
    console.log(e);
    throw e;
  }
};

test('it can manage sessions', async t => {

  await asUserAccount(Accounts.CREATOR , async () => {
    const publicAddress = (await AQVS.web3.eth.getCoinbase()).toLowerCase();

    // Make a session
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
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

  await asUserAccount(Accounts.CREATOR, async publicAddress => {
    const initialBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(publicAddress)
    );

    await AQVS.initContracts();
    const aqvsInitialBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(AQVS.contracts.aqvs.address)
    );

    // Estimate the weiCostToMintSpace
    const weiCostToMintSpace = await AQVS.creators.estimateCostToMintSpaceInWei(
      AQVS.units.mb * 5,
    );

    // It can mint a space
    const tx = await AQVS.creators.mintSpace(
      3,
      AQVS.units.mb * 5,
      AQVS.web3.utils.toWei('1', 'ether'),
      false
    );
    const txGasUsed =
      AQVS.web3.utils.toBN(tx.receipt.cumulativeGasUsed);
    const txGasPrice =
      AQVS.web3.utils.toBN((await AQVS.web3.eth.getTransaction(tx.tx)).gasPrice);
    const txCost =
      txGasUsed.mul(txGasPrice);

    const mintEvent = tx.logs.find(l => l.event === 'DidMintSpace');
    SPACE_ID = mintEvent.args.spaceId.toString();
    const spaceAddress = mintEvent.args.spaceAddress;
    t.is(!!SPACE_ID, true);
    t.is(!!spaceAddress, true);

    const postBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(publicAddress)
    );
    t.is(
      postBalance.toString(),
      initialBalance.sub(weiCostToMintSpace).sub(txCost).toString()
    );

    const aqvsPostBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(AQVS.contracts.aqvs.address)
    );
    t.is(
      aqvsPostBalance.toString(),
      aqvsInitialBalance.add(weiCostToMintSpace).toString()
    );

    // The created space is now owned by the creator
    const createdSpaceIds =
      (await AQVS.spaces.getSpaceIdsCreatedBy(publicAddress)).map(bn => bn.toString());
    t.is(createdSpaceIds.includes(SPACE_ID), true);

    // Load the Space Contract
    const spaceContract = await AQVS.spaces.getSpaceById(SPACE_ID);
    const spaceContractByAddress = await AQVS.spaces.getSpaceByAddress(spaceAddress);
    t.is(spaceContract, spaceContractByAddress);

    // The AQVS user canModifySpace, but others can not
    t.is((await AQVS.spaces.canModifySpace(spaceContract)), true);
    t.is((await AQVS.spaces.canModifySpace(spaceContract, publicAddress)), true);
    t.is((await AQVS.spaces.canModifySpace(
      spaceContract,
      AQVS.web3.currentProvider.addresses[1]
    )), false);

    // The AQVS user canAccessSpace, but others can not
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), true);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract, publicAddress)), true);
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      AQVS.web3.currentProvider.addresses[1]
    )), false);

    // The AQVS user needs a session to update metadata and files
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    const currentSession = await makeSessionResponse.json();
    let cookie = makeSessionResponse.headers.get('set-cookie');
	  t.is(!!currentSession.publicAddress, true);

    // The AQVS creator can setSpaceMetadata (which also serves as the ERC1155 token metadata)
    const response = await AQVS.creators.setSpaceMetadata(SPACE_ID, {
      name: 'Rainbow Chan',
      description: 'Spacings',
      image: 'https://f4.bcbits.com/img/a0195171096_16.jpg'
    }, cookie);
	  t.is((await response.json()).status, 'ok');

    // The anyone can getSpaceMetadata (which also serves as the ERC1155 token metadata)
    const getSpaceMetadataResponse = await AQVS.spaces.getSpaceMetadata(SPACE_ID);
    const metadata = await getSpaceMetadataResponse.json();
	  t.is(metadata.name, 'Rainbow Chan');
	  t.is(metadata.description, 'Spacings');
	  t.is(metadata.image, 'https://f4.bcbits.com/img/a0195171096_16.jpg');

    // The AQVS Creator can deleta all files in the Space
    const deleteAllFilesInSpaceResponse =
      await AQVS.creators.deleteAllFilesInSpace(SPACE_ID, cookie);
	  t.is((await deleteAllFilesInSpaceResponse.json()).status, 'ok');

    const getSpaceContentsResponse = await AQVS.spaces.getSpaceContents(SPACE_ID, cookie);
    const contents = await getSpaceContentsResponse.json();
	  t.is(contents.length, 0);

    // Test an Upload
    const formData = new FormData();
    formData.append('/pixel.png', fs.createReadStream('./test/pixel.png'));
    const uploadFileResponse = await AQVS.creators.uploadFilesToSpace(SPACE_ID, formData, cookie);
	  t.is(
      (await uploadFileResponse.json()).success[0],
      '/pixel.png'
    );

  });

});

test('it can access spaces', async t => {

  await asUserAccount(Accounts.BUYER, async (publicAddress) => {
    const spaceContract = await AQVS.spaces.getSpaceById(SPACE_ID);
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

    const getSpaceContentsResponse = await AQVS.spaces.getSpaceContents(SPACE_ID, cookie);
	  t.is((await getSpaceContentsResponse.json()).error.message, 'unauthorized');

    // Downloads don't work
    const proxy = AQVS.ENVIRONMENTS[AQVS.env].proxy;
    const fetchFileResponse = await fetch(`${proxy}/spaces/${SPACE_ID}/pixel.png`, {
      method: 'GET',
      credentials: 'include',
      headers: { cookie }
    });
    t.is(fetchFileResponse.status, 500);
  });

  await asUserAccount(Accounts.CREATOR, async () => {
    const publicAddress = (await AQVS.web3.eth.getCoinbase()).toLowerCase();
    const spaceContract = await AQVS.spaces.getSpaceById(SPACE_ID);
    const tx = await spaceContract.setPurchasable(true, { from: publicAddress });
    // TODO: Add event to search for
  });

  await asUserAccount(Accounts.BUYER, async publicAddress => {
    await AQVS.initContracts();
    const aqvsInitialBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(AQVS.contracts.aqvs.address)
    );

    const spaceContract = await AQVS.spaces.getSpaceById(SPACE_ID);
    const tx = await AQVS.spaces.accessSpace(spaceContract);
    const accessEvent = tx.logs.find(l => l.event === 'DidAccessSpace');
    const spaceId = accessEvent.args.spaceId.toString();
    const spaceAddress = accessEvent.args.spaceAddress;
    t.is(SPACE_ID, spaceId);
    t.is(spaceAddress, spaceContract.address);
    t.is((await AQVS.spaces.canAccessSpace(spaceContract)), true);

    // The created space is now owned by the buyer
    const ownedSpaceIds =
      (await AQVS.spaces.getSpaceIdsOwnedBy(publicAddress)).map(bn => bn.toString());
    t.is(ownedSpaceIds.includes(SPACE_ID), true);

    const remainingSupply = await AQVS.spaces.remainingSupply(spaceContract);
    t.is(remainingSupply.toNumber(), 2);

    const aqvsPostBalance = AQVS.utils.ensureBigNumber(
      await AQVS.web3.eth.getBalance(AQVS.contracts.aqvs.address)
    );

    t.is(
      (await AQVS.spaces.spaceFees(
        spaceContract
      )).toString(),
      (await AQVS.creators.estimateSpaceAccessFeesInWei(
        3,
        AQVS.units.mb * 5,
        AQVS.web3.utils.toWei('1', 'ether'),
      )).toString()
    );

    t.is(
      aqvsPostBalance.toString(),
      aqvsInitialBalance.add(
        await AQVS.creators.estimateSpaceAccessFeesInWei(
          3,
          AQVS.units.mb * 5,
          AQVS.web3.utils.toWei('1', 'ether'),
        )
      ).toString()
    );

    // The AQVS user needs a session
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    let cookie = makeSessionResponse.headers.get('set-cookie');

    // Can access!
    const getSpaceContentsResponse = await AQVS.spaces.getSpaceContents(SPACE_ID, cookie);
    t.is((await getSpaceContentsResponse.json())[0].path, '/pixel.png');

    // Test downloading now works!
    const proxy = AQVS.ENVIRONMENTS[AQVS.env].proxy;
    const fetchFileResponse = await fetch(`${proxy}/spaces/${SPACE_ID}/pixel.png`, {
      method: 'GET',
      credentials: 'include',
      headers: { cookie }
    });
    t.is(fetchFileResponse.status, 200);
  });

  await asUserAccount(Accounts.CREATOR, async publicAddress => {
    const spaceContract = await AQVS.spaces.getSpaceById(SPACE_ID);

    // It can add delete an individual file
    const makeSessionResponse = await AQVS.sessions.makeSession(publicAddress);
    let cookie = makeSessionResponse.headers.get('set-cookie');
    const deleteFileInSpaceResponse =
      await AQVS.creators.deleteFileInSpace(SPACE_ID, '/pixel.png', cookie);
	  t.is((await deleteFileInSpaceResponse.json()).status, 'ok');

    // It can add space capacity
    const addSpaceCapacityTx
      = await AQVS.creators.addSpaceCapacityInBytes(SPACE_ID, AQVS.units.mb * 1);
    const spaceCapacity = await spaceContract.spaceCapacityInBytes();
    t.is(spaceCapacity.toNumber(), AQVS.units.mb * 6);

    // It can gift space access
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      AQVS.web3.currentProvider.addresses[2]
    )), false);
    const giftSpaceAccessTx = await AQVS.creators.giftSpaceAccess(
      SPACE_ID,
      AQVS.web3.currentProvider.addresses[2]
    );
    const event = giftSpaceAccessTx.logs.find(l => l.event === 'DidGiftSpaceAccess');
    const spaceId = event.args.spaceId.toString();
    const spaceAddress = event.args.spaceAddress;
    t.is(SPACE_ID, spaceId);
    t.is(spaceAddress, spaceContract.address);
    t.is((await AQVS.spaces.canAccessSpace(
      spaceContract,
      AQVS.web3.currentProvider.addresses[2]
    )), true);
  });

});
