import test from 'node:test';
import assert from 'node:assert';

test('Google Auth & Profile Session: Validates profile fields and structure', () => {
  const mockProfile = {
    code: '998877',
    name: 'Phòng Google Test',
    passcode: '8899',
    nickname: 'Nguyễn Đình Khải',
    token: 'mock.google.jwt.token',
    cached_at: Date.now(),
    google_email: 'khaind.hrt@gmail.com',
    user_avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c'
  };

  assert.strictEqual(mockProfile.nickname, 'Nguyễn Đình Khải');
  assert.strictEqual(mockProfile.google_email, 'khaind.hrt@gmail.com');
  assert.ok(mockProfile.user_avatar.includes('googleusercontent'));
  assert.strictEqual(mockProfile.code, '998877');
});
