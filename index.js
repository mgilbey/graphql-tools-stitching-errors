const {
  ApolloServer,
  ApolloError,
  introspectSchema,
  makeExecutableSchema,
  makeRemoteExecutableSchema,
  mergeSchemas,
  gql
} = require('apollo-server');
const http = require('http');
const fs = require('fs');
const {HttpLink} = require('apollo-link-http');
const fetch = require('node-fetch');

const cars = [
  {
    __typename: 'Car',
    make: 'Land Rover',
    model: 'Range Rover',
    year: 2015,
  },
];

const schema = makeExecutableSchema({
  typeDefs: gql`
    type Car {
      make: String!
      model: String!
      year: Int!
      inventory: Int
    }

    type Query {
      cars: [Car]
    }
  `,
  resolvers: {
    Car: {
      inventory() {
        throw new ApolloError('test error', 'CUSTOM_ERROR_CODE', {
          someExtraErrorProp: 'Something!',
        });
      }
    },
    Query: {
      cars() {
        return cars;
      },
    },
  },
});


// "good" server that will propagate extensions from an error when no stitching occurs
const goodApolloServer = new ApolloServer({schema});
goodApolloServer.listen(3000);

// "bad" apollo server that will not propagate extensions when stitching a merged schema
const badApolloServer = new ApolloServer({
  schema: mergeSchemas({schemas: [schema]}),
});
badApolloServer.listen(3001);

// our "bad" remote with a stubbed response containing an error
http.createServer((req, res) => {
  fs.readFile('./response-with-error.json', (err, data) => {
    if (err) throw err;
    res.statusCode = 200;
    res.setHeader('Content-Type', "application/json");
    res.end(data);
  });
}).listen(3003);

// a "good" apollo link we can introspect to create a remote executable schema
const goodLink = new HttpLink({uri: 'http://localhost:3000/graphql', fetch});
// a "bad" apollo link that will fetch from our remote with a stubbed error
const badLink = new HttpLink({uri: 'http://localhost:3003/graphql', fetch});

// our second "bad" server that will not propagate extensions when stitching **remote* schema
introspectSchema(goodLink).then((remoteSchema) => {
    const executableSchema = makeRemoteExecutableSchema({
      schema: remoteSchema,
      link: badLink,
    });

    const badRemoteApolloServer = new ApolloServer({
      schema: mergeSchemas({schemas: [executableSchema]}),
    });
    badRemoteApolloServer.listen(3002);
  }
);
