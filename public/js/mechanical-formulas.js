/**
 * Vibration Utilities — Theoretical Natural Frequency via Beam Theory
 * Assumes cantilever beam first-mode analysis
 */

function naturalFrequency(k, m) {
  return (1 / (2 * Math.PI)) * Math.sqrt(k / m);
}

function qFactor(fn, bandwidth) {
  return bandwidth > 0 ? fn / bandwidth : 0;
}

function bandwidth(fn, q) {
  return q > 0 ? fn / q : 0;
}

function frequencyResponse(f, fn, q) {
  const r = f / fn;
  return q / Math.sqrt(Math.pow(q * q * (1 - r * r), 2) + 1);
}

function calculateRMS(signal) {
  if (signal.length === 0) return 0;
  const sumOfSquares = signal.reduce((sum, x) => sum + x * x, 0);
  return Math.sqrt(sumOfSquares / signal.length);
}

function crestFactor(signal) {
  if (signal.length === 0) return 0;
  const rms = calculateRMS(signal);
  if (rms === 0) return 0;
  const peak = Math.max(...signal.map(Math.abs));
  return peak / rms;
}

/**
 * First-mode Theoretical Natural Frequency for a Cantilever Beam
 * f_n = (1.875² / 2π) * sqrt(EI / (ρ A L⁴))
 */
function theoreticalNaturalFrequencyCantileverBeam(E, rho, L, b, d) {
  const A = b * d;
  const I = (b * Math.pow(d, 3)) / 12;
  const constant = Math.pow(1.875, 2) / (2 * Math.PI);
  return constant * Math.sqrt((E * I) / (rho * A * Math.pow(L, 4)));
}

/**
 * Estimate Natural Frequency using Beam Theory only
 * Fully replaces empirical/FFT-based estimation
 */
function estimateNaturalFrequency() {
  const E = 2e11;    // Pa (Young’s modulus for steel)
  const rho = 7850;  // kg/m³ (steel density)
  const L = 0.25;    // m (length)
  const b = 0.025;   // m (width)
  const d = 0.001;   // m (thickness)
  return theoreticalNaturalFrequencyCantileverBeam(E, rho, L, b, d);
}

function calculateStiffness(fn, m) {
  const omega = 2 * Math.PI * fn;
  return m * omega * omega;
}

function naturalPeriod(fn) {
  return fn > 0 ? 1 / fn : 0;
}

// Optional: remove legacy peak estimation entirely
function findPeaks() {
  console.warn("Peak-based estimation is deprecated. Use theoretical estimation instead.");
  return [];
}

export {
  naturalFrequency,
  qFactor,
  bandwidth,
  frequencyResponse,
  calculateRMS,
  crestFactor,
  estimateNaturalFrequency,
  calculateStiffness,
  naturalPeriod
};
