// Encryption & tamper detection — the core security primitive (utils/cipher.js).
export async function run({ app, t }) {
  const { encrypt, decrypt } = app.cipher;

  const plain = 'Acute bronchitis';
  const ct = encrypt(plain);

  t.ok(decrypt(ct) === plain, 'round-trips plaintext back to the original');
  t.ok(ct !== plain && ct.split(':').length === 3, 'ciphertext is formatted as iv:data:tag');
  t.ok(encrypt(plain) !== encrypt(plain), 'same plaintext encrypts differently each time (random IV)');
  t.ok(encrypt('') === '' && encrypt(null) === null, 'empty/null values pass through unencrypted');
  t.ok(decrypt(null) === null, 'decrypt(null) is null');

  t.section('Tamper detection (AES-256-GCM auth tag)');
  const [iv, data, tag] = ct.split(':');
  const flip = (hex) => { const b = Buffer.from(hex, 'hex'); b[0] ^= 0xff; return b.toString('hex'); };

  t.ok(decrypt(`${iv}:${flip(data)}:${tag}`) === null, 'tampered ciphertext body → null');
  t.ok(decrypt(`${iv}:${data}:${flip(tag)}`) === null, 'tampered auth tag → null');
  t.ok(decrypt(`${flip(iv)}:${data}:${tag}`) === null, 'tampered IV → null');
  t.ok(decrypt('garbage-not-our-format') === null, 'malformed input → null (no crash)');
}
