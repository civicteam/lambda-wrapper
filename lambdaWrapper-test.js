// Test function. Save as lambdaWrapper-test to your AWS env

module.exports.handler = (event, context, callback) => {
  callback(null, {
    src: 'lambda',
    event
  });
};
