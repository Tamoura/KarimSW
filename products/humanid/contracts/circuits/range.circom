/**
 * Range Circuit — Groth16 / BN128
 *
 * Proves: a value falls within [min, max], without revealing the value.
 *
 * Private inputs: value
 * Public inputs:  min, max
 * Public output:  inRange (0 or 1)
 *
 * Reference only — compile with circom 2.x:
 *   circom range.circom --r1cs --wasm --sym
 */

pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

template Range() {
    // Private input
    signal input value;

    // Public inputs
    signal input minVal;
    signal input maxVal;

    // Public output
    signal output inRange;

    // Check: value >= minVal
    component gteMin = GreaterEqThan(64);
    gteMin.in[0] <== value;
    gteMin.in[1] <== minVal;

    // Check: value <= maxVal (equivalent to maxVal >= value)
    component lteMax = GreaterEqThan(64);
    lteMax.in[0] <== maxVal;
    lteMax.in[1] <== value;

    // Both conditions must hold
    inRange <== gteMin.out * lteMax.out;
}

component main {public [inRange]} = Range();
