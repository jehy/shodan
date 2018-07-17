exports.up = (knex) => {
  console.log('Warning, this may take large time on big database, please wait...');
  return knex.raw('OPTIMIZE TABLE logs');
};

exports.down = () => {
  return Promise.resolve();
};
