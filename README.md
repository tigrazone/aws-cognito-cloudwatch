# dashboard-node-backend

## Needed software
```
Node.js version 18.12.1
NPM version 9.4.1
package.json contains needed node packages
deduce-reporting.postman_collection.json data for Postman
```

## How to run

```
copy .env.example to .env
write access data of Cognito, Cloudwatch logger to .env

npm install
npm run start

for local start with nodemon use
npm run local
```

## Routes

```
GET /health_checks
Health check of server

no params. 
Response in JSON format data with fields:
uptime: number of seconds the Node.js process is running,
message: 'Ok',
date: current date and time in UTC format, look like "2023-02-17T14:09:04.194Z"
```

```
POST /api/auth/token
Login user in Cognito

params in body in JSON format
email: email of user
password: password of user

Response in JSON format
user: user data from Cognito
access: access token for Cognito
refresh: refresh token for Cognito
```

```
POST /api/auth/token/refresh
Refresh Cognito tokens

params in body in JSON format
email: email of user
token: refresh token for Cognito

Response in JSON format
user: user data from Cognito
access: refreshed access token for Cognito
refresh: refreshed refresh token for Cognito
```

```
POST /api/auth/token/verify
Verify access Cognito token

params in body in JSON format
token: access token for Cognito

Response in JSON format
"message": {
        "error": "Not a valid JWT token"
    }
if token is not valid 
OR
result: decoded data from token
```

```
GET /api/auth/logout
Sign out from Cognito

params in header
authorization: Bearer access_token 

Response in JSON format
"message": {
        "OK"
    }
if successed signed out	
OR
"message": "jwt expired"
when token is expired
```


```
GET /api/dashboard/filters
Get list of filters for API

params in header
authorization: Bearer access_token 

Response in JSON format
array of filers in format
"value": "1",
"label": "ACTIVITY_MATCH_EMAILIP",
"description": "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
```

```
GET /api/dashboard/table-events/columns
Get list of table columns of events for API

params in header
authorization: Bearer access_token 

Response in JSON format
array of filers in format
{id: 'date', label: 'Date', is_active: true}
```

```
GET /api/dashboard/charts
Get list of data for charts

params in header
authorization: Bearer access_token 

params in body in JSON format
search: "some text" for search in events table
filter: filter ids in format '37, 24'
period_min: "2021-10-16 17:00" start of period for search data
period_max: "2021-10-18 17:00" end of period for search data
time_type: "utc" or "local"
time_shift: number in minutes, shift from UTC time for time_type: "utc"

Response in JSON format
{
 events: {
   labels: ['2023-01-01', '2023-01-02', '2023-01-03', …],
   total: [2700, 2900, 3010, …],
   filtered: [900, 1290, 1101, …],
   timeUnit: 'day' 
 },
 users: {
   labels: ['2023-01-01', '2023-01-02', '2023-01-03', …],
   total: [270, 190, 201, …],
   filtered: [90, 129, 110, …],
   timeUnit: 'day'
 },
 alerts: {
   labels: ['2023-01-01', '2023-01-02', '2023-01-03', …],
   total: [0, 0, 300, …],
   filtered: [900, 1290, 1101, …],
   timeUnit: 'day' 
 }
}
for distance between dates more then 24 hours

 events: {
   labels: ['2023-01-01 01:00', '2023-01-01 02:00', '2023-01-01 03:00', …],
   total: [270, 290, 301, …],
   filtered: [90, 129, 110, …],
   timeUnit: 'hour' 
 },
 users: {
   labels: ['2023-01-01 01:00', '2023-01-01 02:00', '2023-01-01 03:00', …],
   total: [270, 190, 201, …],
   filtered: [90, 129, 110, …],
   timeUnit: 'hour'
 },
 alerts: {
   labels: ['2023-01-01 01:00', '2023-01-01 02:00', '2023-01-01 03:00', …],
   total: [270, 190, 201, …],
   filtered: [90, 129, 110, …],
   timeUnit: 'hour'
 }
for distance between dates smaller then 24 hours
```

```
GET /api/dashboard/table-events
Get list of events for API

params in header
authorization: Bearer access_token 

params in body in JSON format
search: "some text" for search in events table
filter: filter ids in format '37, 24'
period_min: "2021-10-16 17:00" start of period for search data
period_max: "2021-10-18 17:00" end of period for search data
time_type: "utc" or "local"
time_shift: number in minutes, shift from UTC time for time_type: "utc"
offset: offset from start of array of data
sort: 'date' or '-date' - sort by date in ascending/descending order

Response in JSON format
next: link to next data chunk OR null if this is a last chunk
result: array of events
```

```
GET /api/dashboard/table-events/details?request_id= id of event
Get information about one event

params in header
authorization: Bearer access_token 

Response in JSON format
event data
```

## Discaimer
cognito.verify from app/config/cognito.js works well with access tokens, not with refresh tokens



