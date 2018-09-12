# Shodan

[![Build Status](https://travis-ci.org/jehy/shodan.svg?branch=master)](https://travis-ci.org/jehy/shodan)
[![dependencies Status](https://david-dm.org/jehy/shodan/status.svg)](https://david-dm.org/jehy/shodan)
[![devDependencies Status](https://david-dm.org/jehy/shodan/dev-status.svg)](https://david-dm.org/jehy/shodan?type=dev)
[![Known Vulnerabilities](https://snyk.io/test/github/jehy/shodan/badge.svg)](https://snyk.io/test/github/jehy/shodan)

Advanced error monitoring using kibana logs.

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
4. Run `npm run migrate` to set up DB
5. Run `npm i`
6. `npm run start`  and `npm run updater` (those are 2 different processes!)
7. Enjoy!

### Configuration

* `kibana`
    * `"cookie": "_oauth2_proxy=XXXXX"` your own kibana cookie
    * `"version": "5.5.2",`your kibana version
    * `"url": "https://logs.google.com",` your kibana url
    * `"firstSearchFor": 24,` first search should begin fetching entries from 24 hours ago
    * `"searchFor": 1,` new entries are fetched 1 last hour
    * `"crawlDelay": 1` delay by 1 minute to avoid ignoring entries which were added to the past
    * `"preference": 1521709471107,` some preference id from kibana requests, dunno wtf
    * `"indexes": ["some-app"],` index names to search for
    * `"indexFilterOut": ["some-app-extra"],` filter for indices
    * `"fetchNum": 500,` max entries to fetch
    * `"updateInterval": 30,`how often we should fetch updates, in seconds
    * `"storeLogsFor": 7` for how many days do you want to store logs

*  `"userAgent": "Mozilla/5.0 (X11; Linux x86_64)",` useragent string to use for kibana search

*  `"db"` standard database options
    * `"client": "mysql",`
    * `"connection":`
        *  `"host": "127.0.0.1",`
        *  `"user": "your_database_user",`
        *  `"password": "your_database_password",`
        *  `"database": "myapp_test",`
        *  `"charset": "utf8"`
    * `"migrations":`
        *  `"tableName": "knex_migrations"`
