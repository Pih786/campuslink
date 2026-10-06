const { Client } = require("pg");

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

client.connect()
  .then(() => {
    console.log("✅ DATABASE CONNECTION SUCCESSFUL");
    return client.query("SELECT version()");
  })
  .then(result => {
    console.log(result.rows[0]);
    return client.end();
  })
  .catch(error => {
    console.error("❌ DATABASE CONNECTION FAILED");
    console.error(error.message);
    process.exit(1);
  });