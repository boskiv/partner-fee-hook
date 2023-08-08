const { expect } = require("chai");
const { ethers, unlock } = require("hardhat");

const keyPrice = ethers.utils.parseEther('0.1')
const referrerAmount = keyPrice.mul(20).div(100)

const getBalances = async (objects) => {
  const balances = {}
  await Promise.all(Object.keys(objects).map(async (name) => {
    balances[name] = await ethers.provider.getBalance(objects[name].address)
  }))
  return balances
}


describe("PurchaseHook", function () {
  before(async () => {
    await unlock.deployProtocol();
  });

  it("should set referrer on purchase", async () => {
    const [user, manager, referrer] = await ethers.getSigners();
    console.log(
      `Manager: ${manager.address}\nRecipient: ${user.address}\nReferrer: ${referrer.address}`
    );

    // Deploy a lock
    const { lock } = await unlock.createLock({
      expirationDuration: 60 * 60 * 24 * 7,
      maxNumberOfKeys: 100,
      keyPrice,
      name: "My NFT membership contract",
    });

    console.log("Lock address", lock.address);

    // Deploy the hook
    const PurchaseHook = await ethers.getContractFactory("PurchaseHook");
    const hook = await PurchaseHook.deploy(lock.address);
    await hook.deployed();
    console.log("Hook address", hook.address);

    await (
      await lock.setEventHooks(
        hook.address, // _onKeyPurchaseHook
        ethers.constants.AddressZero, // _onKeyCancelHook
        ethers.constants.AddressZero, // _onValidKeyHook
        ethers.constants.AddressZero, // _onTokenURIHook
        ethers.constants.AddressZero, // _onKeyTransferHook
        hook.address, // _onKeyExtendHook
        ethers.constants.AddressZero // _onKeyGrantHook
      )
    ).wait();
    console.log("Hook attached to lock");

    // set referrer fee at 20% of key price
    await (await hook.setReferrerAmount(referrer.address, referrerAmount)).wait();
    expect(await hook.referalAmounts(referrer.address)).to.equal(keyPrice.mul(20).div(100))
    console.log("Referrer fee set");

    await (await lock.addLockManager(hook.address)).wait();
    console.log("Hook added as lock manager");

    // And now make a purchase
    expect(lock.address).to.be.properAddress;
    expect(hook.address).to.be.properAddress;

    console.log("Ready for purchase");

    // Get the token balances
    const balancesBefore = await getBalances({
      referrer,
      lock,
      user
    })

    expect(await lock.getHasValidKey(user.address)).to.equal(false)

    await (
      await lock.purchase(
        [keyPrice],
        [user.address], // recipient
        [referrer.address], // referrer
        [manager.address], // key manager
        [[]], // data
        { value: keyPrice }
      )
    ).wait();

    expect(await lock.getHasValidKey(user.address)).to.equal(true)

    const tokenId = await lock.tokenOfOwnerByIndex(user.address, 0)

    // Let's check the balances

    const balancesAfterPurchase = await getBalances({
      referrer,
      lock,
      user
    })

    expect(balancesAfterPurchase.referrer).to.equal(balancesBefore.referrer.add(referrerAmount))
    expect(balancesAfterPurchase.lock).to.equal(balancesBefore.lock.add(keyPrice).sub(referrerAmount))

    // Let's expire the key so we can test renewals!
    await lock.expireAndRefundFor(tokenId, 0)

    console.log("Ready for renew");
    await (
      await lock.extend(
        keyPrice,
        tokenId, // tokenId
        referrer.address, // referrer (should not be used)
        0 // data
        , { value: keyPrice }
      )
    ).wait();


    const balancesAfterRenew = await getBalances({
      referrer,
      lock,
      user
    })

    expect(balancesAfterRenew.referrer).to.equal(balancesAfterPurchase.referrer.add(referrerAmount))
    expect(balancesAfterRenew.lock).to.equal(balancesAfterPurchase.lock.add(keyPrice).sub(referrerAmount))
  });

});
