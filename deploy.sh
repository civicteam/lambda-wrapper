rm lambda.zip || :
zip lambda.zip lambdaWrapper-test.js
aws lambda create-function --function-name lambdaWrapper-test --runtime nodejs8.10 --handler lambdaWrapper-test.handler --role arn:aws:iam::249634870252:role/MinimalLambdaRole --zip-file fileb://lambda.zip
#aws lambda delete-function --function-name lambdaWrapper-test
