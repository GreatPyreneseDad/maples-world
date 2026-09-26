import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { Noise } from './Noise.ts';

test('Noise 2D produces values in [-1, 1]', () => {
  const n = new Noise(12345);
  for (let i = 0; i < 100; i++) {
    const v = n.noise2(i * 0.1, i * 0.2);
    assert.ok(v >= -1 && v <= 1, `noise2 out of range: ${v}`);
  }
});

test('Noise 2D is deterministic for same seed', () => {
  const n1 = new Noise(42);
  const n2 = new Noise(42);
  assert.equal(n1.noise2(3.14, 2.71), n2.noise2(3.14, 2.71));
});

test('Noise 2D differs for different seeds', () => {
  const n1 = new Noise(1);
  const n2 = new Noise(2);
  assert.notEqual(n1.noise2(1, 1), n2.noise2(1, 1));
});

test('Noise 3D produces values in [-1, 1]', () => {
  const n = new Noise(67890);
  for (let i = 0; i < 100; i++) {
    const v = n.noise3(i * 0.1, i * 0.2, i * 0.3);
    assert.ok(v >= -1 && v <= 1, `noise3 out of range: ${v}`);
  }
});

test('Noise 3D is deterministic for same seed', () => {
  const n1 = new Noise(99);
  const n2 = new Noise(99);
  assert.equal(n1.noise3(1.5, 2.5, 3.5), n2.noise3(1.5, 2.5, 3.5));
});

test('Noise 3D differs for different seeds', () => {
  const n1 = new Noise(10);
  const n2 = new Noise(20);
  // Test at non-trivial coordinates to avoid hash collisions at simple integer coords
  assert.notEqual(n1.noise3(7.3, 11.7, 13.2), n2.noise3(7.3, 11.7, 13.2));
});

test('Noise 3D differs spatially', () => {
  const n = new Noise(123);
  const a = n.noise3(0, 0, 0);
  const b = n.noise3(1, 0, 0);
  const c = n.noise3(0, 1, 0);
  const d = n.noise3(0, 0, 1);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
  assert.notEqual(a, d);
});

test('fbm2 octaves stack correctly', () => {
  const n = new Noise(555);
  const v1 = n.fbm2(5, 5, 1);
  const v4 = n.fbm2(5, 5, 4);
  assert.ok(Math.abs(v1) <= 1);
  assert.ok(Math.abs(v4) <= 1);
  assert.notEqual(v1, v4);
});

test('fbm3 octaves stack correctly', () => {
  const n = new Noise(777);
  // Use prime-offset coordinates to avoid octave cancellation
  const v1 = n.fbm3(7.1, 11.3, 13.7, 1);
  const v4 = n.fbm3(7.1, 11.3, 13.7, 4);
  assert.ok(Math.abs(v1) <= 1);
  assert.ok(Math.abs(v4) <= 1);
  assert.notEqual(v1, v4);
});

test('fbm3 is deterministic', () => {
  const n = new Noise(888);
  const a = n.fbm3(10, 20, 30, 3, 2.0, 0.5);
  const b = n.fbm3(10, 20, 30, 3, 2.0, 0.5);
  assert.equal(a, b);
});
