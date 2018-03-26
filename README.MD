# Shodan

Logs monitoring using kibana logs.

## Screenshots

Dashboard:

![Generic dashboard](screenshot-1.png)

Error details:

![Error details](screenshot-2.png)

## Installation

### Requirements:

* node.js 8+
* mysql or mariadb 5+ (pull requests for Postgres welcome)
* kibana
* some free space to store your logs
* you should be able to run socket based interaction

### Installing

1. `git clone https://github.com/jehy/shodan.git`
2. `cp config/default.json config/runtime.json` 
3. Set up `runtime.json` config (see below)
4. Run `./node_modules/.bin/knex migrate:latest` to set up DB
5. Run `npm i`
6. `npm run start`  and `npm run updater` (those are 2 different processes!)
7. Enjoy!

### Configuration

```js
{
  "kibana": {
    "cookie": "", // your own kibana cookie
    "version": "5.5.2",
    "url": "", //kibana url
    "searchFor": 1, //time interval to searh for in the past or in the future, in hours
    "preference": 1521709471107,
    "search": "", //filter for indeces
    "fetchNum": 500, //how many entries to fetch
    "updateInterval": 30, //how often we should getch, in seconds
    "storeLogsFor": 7 // for how many days do you want to store logs
  },
  "userAgent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.162 Safari/537.36",
  "db": {
    "client": "mysql",
    "connection": {
      "host": "127.0.0.1",
      "user": "your_database_user",
      "password": "your_database_password",
      "database": "myapp_test",
      "charset": "utf8"
    },
    "migrations": {
      "tableName": "knex_migrations"
    }
  }
}
```
