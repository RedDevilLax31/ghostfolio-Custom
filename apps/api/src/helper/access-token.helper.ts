import { getRandomString } from '@ghostfolio/api/helper/string.helper';

import { createHmac } from 'node:crypto';

export function createAccessToken({
  password,
  salt
}: {
  password: string;
  salt: string;
}): string {
  const hash = createHmac('sha512', salt);
  hash.update(password);

  return hash.digest('hex');
}

export function generateAccessToken({
  salt,
  userId
}: {
  salt: string;
  userId: string;
}) {
  const accessToken = createAccessToken({
    password: userId,
    salt: getRandomString(10)
  });

  return {
    accessToken,
    hashedAccessToken: createAccessToken({ password: accessToken, salt })
  };
}
