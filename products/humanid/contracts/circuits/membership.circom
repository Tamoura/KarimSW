/**
 * Membership Circuit — Groth16 / BN128
 *
 * Proves: a value exists in a set (Merkle tree), without revealing which.
 *
 * Private inputs: leaf (the member value), pathElements[], pathIndices[]
 * Public output:  isMember (0 or 1)
 *
 * Reference only — compile with circom 2.x:
 *   circom membership.circom --r1cs --wasm --sym
 */

pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal input root;

    signal output isMember;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component hashers[levels];
    component mux[levels];

    for (var i = 0; i < levels; i++) {
        hashers[i] = Poseidon(2);
        mux[i] = Mux1();

        mux[i].c[0] <== hashes[i];
        mux[i].c[1] <== pathElements[i];
        mux[i].s <== pathIndices[i];

        hashers[i].inputs[0] <== mux[i].out;
        hashers[i].inputs[1] <== pathIndices[i] * (pathElements[i] - hashes[i]) + hashes[i];

        hashes[i + 1] <== hashers[i].out;
    }

    // Output 1 if computed root matches provided root
    component eq = IsEqual();
    eq.in[0] <== hashes[levels];
    eq.in[1] <== root;
    isMember <== eq.out;
}

component main {public [isMember]} = MerkleProof(20);
