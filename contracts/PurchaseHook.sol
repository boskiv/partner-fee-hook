// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@unlock-protocol/contracts/dist/PublicLock/IPublicLockV13.sol";
import "hardhat/console.sol";

error Unauthorized();

contract PurchaseHook {
    IPublicLockV13 lock;
    mapping(address => address payable) public referals;
    mapping(address => uint256) public referalAmounts;

    /** Constructor */
    constructor(IPublicLockV13 _lock) {
        lock = _lock;
    }

    // set referal
    function setReferrer(
        address _recipient,
        address payable _referrer
    ) private {
        referals[_recipient] = _referrer;
    }

    // set referal amount
    function setReferrerAmount(address _referrer, uint256 _amount) public {
        if (!lock.isLockManager(msg.sender)) {
            revert Unauthorized();
        }
        referalAmounts[_referrer] = _amount;
    }

    /**
     * Function that is called at the begining of the
     * `purchase` function on the Public Lock contract.
     * It is expected to return the price that has to be
     * paid by the purchaser (as a uint256). If this
     * reverts, the purchase function fails.
     */
    function keyPurchasePrice(
        address /* from */,
        address /* recipient */,
        address /* referrer */,
        bytes calldata /* data */
    ) external view returns (uint256 minKeyPrice) {
        return lock.keyPrice();
    }

    /**
     * Function that is called at the end of the `purchase`
     * function and that can be used to record and store
     * elements on the hook. Similarly, if this reverts, the
     * purchase function fails.
     */
    function onKeyPurchase(
        uint256 /* tokenId */,
        address /* from */,
        address recipient,
        address payable referrer,
        bytes calldata /*data*/,
        uint256 /*minKeyPrice*/,
        uint256 /*pricePaid*/
    ) external {
        if (msg.sender != address(lock)) {
            revert Unauthorized();
        }
        // console.log("onKeyPurchase");
        // console.log("recipient %s", recipient);
        // console.log("referrer %s", referrer);
        // console.log(referalAmounts[referrer]);

        // Do nothing
        setReferrer(recipient, referrer);
        address currency = lock.tokenAddress();
        lock.withdraw(currency, referrer, referalAmounts[referrer]); // Pay fee to referrer
    }

    function onKeyExtend(
        uint256 /* _tokenId*/,
        address from,
        uint256 /* newTimestamp */,
        uint256 /* old expirationTimestamp */
    ) external {
        if (msg.sender != address(lock)) {
            revert Unauthorized();
        }
        // console.log("onKeyExtend");
        address payable referrer = referals[from];
        address currency = lock.tokenAddress();
        lock.withdraw(currency, referrer, referalAmounts[referrer]);
    }
}
