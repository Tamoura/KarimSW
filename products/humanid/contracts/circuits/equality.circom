/**
 * Equality Circuit — Groth16 / BN128
 *
 * Proves: an attribute matches a committed hash, without revealing the value.
 *
 * Private inputs: attributeValue, salt
 * Public inputs:  expectedHash
 * Public output:  matches (0 or 1)
 *
 * Reference only — compile with circom 2.x:
 *   circom equality.circom --r1cs --wasm --sym
 */

pragma circom 2.0.0;

include "circomlib/circuits/poseidon.circom";

template Equality() {
    // Private inputs
    signal input attributeValue;
    signal input salt;

    // Public inputs
    signal input expectedHash;

    // Public output
    signal output matches;

    // Hash the attribute with salt
    component hasher = Poseidon(2);
    hasher.inputs[0] <== attributeValue;
    hasher.inputs[1] <== salt;

    // Compare computed hash with expected
    component eq = IsEqual();
    eq.in[0] <== hasher.out;
    eq.in[1] <== expectedHash;

    matches <== eq.out;
}

component main {public [matches]} = Equality();
