const fixedUuid = '00000000-0000-4000-8000-000000000000';

module.exports = {
  NIL: '00000000-0000-0000-0000-000000000000',
  v1: () => fixedUuid,
  v3: () => fixedUuid,
  v4: () => fixedUuid,
  v5: () => fixedUuid,
  validate: () => true,
  version: () => 4,
};
