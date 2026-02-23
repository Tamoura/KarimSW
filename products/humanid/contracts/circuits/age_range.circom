/**
 * Age Range Circuit — Groth16 / BN128
 *
 * Proves: holder's age >= threshold, without revealing date of birth.
 *
 * Private inputs: dateOfBirth (Unix timestamp), currentDate, threshold
 * Public output:  ageOverThreshold (0 or 1)
 *
 * Reference only — compile with circom 2.x:
 *   circom age_range.circom --r1cs --wasm --sym
 */

pragma circom 2.0.0;

include "circomlib/circuits/comparators.circom";

template AgeRange() {
    // Private inputs
    signal input dateOfBirth;   // Unix timestamp of birth
    signal input currentDate;   // Unix timestamp of current date
    signal input threshold;     // Minimum age in years

    // Public output
    signal output ageOverThreshold;

    // Calculate age in seconds
    signal ageSecs;
    ageSecs <== currentDate - dateOfBirth;

    // Convert threshold to seconds (approximate: 365.25 days/year)
    signal thresholdSecs;
    thresholdSecs <== threshold * 31557600;

    // Compare: ageSecs >= thresholdSecs
    component gte = GreaterEqThan(64);
    gte.in[0] <== ageSecs;
    gte.in[1] <== thresholdSecs;

    ageOverThreshold <== gte.out;
}

component main {public [ageOverThreshold]} = AgeRange();
