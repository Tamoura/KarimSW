// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title HumanIDAnchor
 * @notice Minimal on-chain anchor for HumanID identity events.
 *         Stores SHA-256 hashes of DIDs, credentials, and revocations.
 *
 * @dev Deploy to Polygon (Amoy testnet / mainnet).
 *      The HumanID API calls anchor(bytes32) via ethers.js Contract.
 *      No storage — events only — keeps gas costs minimal.
 */
contract HumanIDAnchor {
    event Anchored(bytes32 indexed hash, uint256 timestamp);

    /**
     * @notice Anchor a hash on-chain.
     * @param hash SHA-256 hash of the identity event data.
     */
    function anchor(bytes32 hash) external {
        emit Anchored(hash, block.timestamp);
    }
}
