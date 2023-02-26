/* eslint-disable prefer-const */
/* eslint-disable camelcase */
/* eslint-disable no-shadow */
/* eslint-disable no-tabs */
/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
/* eslint-disable guard-for-in */
/* eslint-disable prefer-destructuring */

const { QueryTypes } = require('sequelize');
const Joi = require('joi');
const NodeCache = require('node-cache');
const db = require('../models');

const myCache = new NodeCache({ stdTTL: 100, checkperiod: 3600 });

// get all filters
exports.filters = async (req, res) => {
  let value = myCache.get('filters');
  let result = [];
  if (value === undefined) {
    // handle miss!
    const query = 'SELECT id as value, signal as label,description  FROM report.signals';
    try {
      result = await db.sequelize.query(query, { type: QueryTypes.SELECT });
    } catch (err) {
      res.status(500).send({
        message:	err.message || 'Some SQL error occurred',
      });
      return;
    }
    myCache.set('filters', result);
  } else {
    result = value;
  }

  res.json(result);
};

// get table default columns
exports.tableColumns = async (req, res) => {
  let value = myCache.get('tableColumns');
  let result = [];
  if (value === undefined) {
    // handle miss!
    const query = `SELECT labels as id, REPLACE(INITCAP(labels), '_', ' ') as Label, True as is_active
						FROM (SELECT jsonb_object_keys(event) as labels FROM (SELECT event FROM report.events LIMIT 1) t) v`;
    try {
      result = await db.sequelize.query(query, { type: QueryTypes.SELECT });
    } catch (err) {
      res.status(500).send({
        message:	err.message || 'Some SQL error occurred',
      });
      return;
    }
    myCache.set('tableColumns', result);
  } else {
    result = value;
  }

  res.json(result);
};

// get charts
exports.charts = async (req, res) => {
  const chartsDataSchema = Joi.object({
    search: Joi.string().allow(null, ''),
    filter: Joi.string().regex(/(\d+(,?\s*)*)+/).allow(null, ''),
    period_min: Joi.date().iso().required(),
    period_max: Joi.date().iso().required(),
    time_type: Joi.string().valid('utc', 'local').required(),
    time_shift: Joi.number().integer().allow(null, ''),
  });

  const validation = chartsDataSchema.validate(req.query, { abortEarly: false });

  if (validation.error) {
    res.status(400).json({
      status: 'error',
      message: validation.error.details,
    });
    return;
  }

  const cacheKey = `${req.username}|${req.originalUrl}`;

  let value = myCache.get(cacheKey);
  if (value === undefined) {
    // handle miss!

    // set default values
    let defaults = { search: '', filter: '', time_shift: 0 };
    Object.keys(defaults).forEach(key => { req.query[key] = req.query[key] || defaults[key]; });

    let {
      search, filter, time_type, time_shift: timeUTCshift, period_min, period_max,
    } = req.query;

    const dat1 = parseInt(new Date(period_min).getTime() / 1000.0, 10);
    const dat2 = parseInt(new Date(period_max).getTime() / 1000.0, 10);

    if (dat1 > dat2) {
      res.status(400).json({
        status: 'error',
        message: [
          {
            message: '"period_min" cant be bigger then "period_max"',
            path: ['period_min', 'period_max'],
          }],
      });
      return;
    }

    let mode = 'day';
    if (dat2 - dat1 <= 86400) {
      mode = 'hour';
    }

    const sqlQuery = `SELECT id as value, signal as label, description FROM report.signals where id in (${filter})`;
    let selectedFilters = [];
    if (filter !== '') {
      try {
        selectedFilters = await db.sequelize.query(sqlQuery, { type: QueryTypes.SELECT });
      } catch (err) {
        res.status(500).send({
          message:	err.message || 'Some SQL error occurred',
        });
        return;
      }
    }

    const filersStr = selectedFilters.reduce((accumulator, currentValue) => `${accumulator + (accumulator.length > 0 ? ', ' : '')}"${currentValue.label}"`, '');

    let timeTypeUTCshift = '';
    if (time_type === 'local') {
      if (timeUTCshift !== 0) timeTypeUTCshift = ` + INTERVAL '${timeUTCshift} minutes'`;
    } else {
      timeUTCshift = 0;
    }

    let viewQuery = `(
	SELECT ip,
		   email,
		   emailip,
		   device,
		   network,
		   location,
		   request,
		   signals,
		   alert,
		   score,
		   date,
		   request_id,
		   request_ip,
		   request_site,
		   request_email,
		   request_device_id,
		   signals_array,
		   event,
		   EXTRACT(hour FROM date) AS hour,
		   date::DATE              AS date_only
	FROM report.events
	WHERE request_site = '${req.usersite}'  -- straight defined filters
	  AND date_trunc('hour', date) <= '${period_min}'::timestamp ${timeTypeUTCshift}
	  AND date_trunc('hour', date) >= '${period_max}'::timestamp ${timeTypeUTCshift}`;

    if (filersStr !== '') {
      viewQuery += `
		AND '{ ${filersStr} }' && signals_array -- filter for signals
		`;
    }

    viewQuery += `
	  AND (request_id LIKE '%${search}%' OR  request_device_id LIKE '%${search}%' OR events.request_email LIKE '%${search}%' OR request_ip  LIKE '%${search}%')
    ) as temp`;

    // for hour
    const sqlHourQuery = `SELECT a.date, total, users, alerts, filtered_total, filtered_users, filtered_alerts
				FROM (SELECT date_trunc as date, sum(total) as total, sum(users) as users, sum(alerts) as alerts
					  FROM (SELECT date_trunc, total, users, alerts
							FROM report.daily
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}
							UNION
							SELECT date_trunc, total, users, alerts
							FROM report.hourly
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}
							UNION
							SELECT date_trunc, total, users, alerts
							FROM report.hour
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}) v
					  GROUP BY date_trunc) a
						 LEFT JOIN (SELECT date_trunc('hour', date)          as date,
										   count(request_site)               as filtered_total,
										   count(distinct request_email)     as filtered_users,
										   COUNT(CASE WHEN alert THEN 1 END) as filtered_alerts
									FROM ${viewQuery}
                    GROUP BY date_trunc('hour', date)) t ON a.date = t.date`;

    // for days
    const sqlDaysQuery = `SELECT a.date, total, users, alerts, filtered_total, filtered_users, filtered_alerts
				FROM (SELECT date_trunc::Date as date, sum(total) as total, sum(users) as users, sum(alerts) as alerts
					  FROM (SELECT date_trunc, total, users, alerts
							FROM report.daily
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}
							UNION
							SELECT date_trunc, total, users, alerts
							FROM report.hourly
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}
							UNION
							SELECT date_trunc, total, users, alerts
							FROM report.hour
							WHERE request_site = '${req.usersite}'
							  AND date_trunc <= '${period_max}'::timestamp ${timeTypeUTCshift}
							  AND date_trunc >= '${period_min}'::timestamp ${timeTypeUTCshift}) v
					  GROUP BY date_trunc::date) a
						 LEFT JOIN (SELECT date_trunc('hour', date)::date          as date,
										   count(request_site)               as filtered_total,
										   count(distinct request_email)     as filtered_users,
										   COUNT(CASE WHEN alert THEN 1 END) as filtered_alerts
									FROM ${viewQuery}
                    GROUP BY date_trunc('hour', date)::date) t ON a.date = t.date`;

    const query = (mode === 'hour' ? sqlHourQuery : sqlDaysQuery);
    let response = [];
    try {
      response = await db.sequelize.query(query, { type: QueryTypes.SELECT });
    } catch (err) {
      res.status(500).send({
        message:	err.message || 'Some SQL error occurred',
      });
      return;
    }

    const result = {
      events: {
        labels: [], total: [], filtered: [], timeUnit: mode,
      },
      users: {
        labels: [], total: [], filtered: [], timeUnit: mode,
      },
      alerts: {
        labels: [], total: [], filtered: [], timeUnit: mode,
      },
    };

    // 90 => 1 30, -90 => 1 30
    const hoursShift = Math.abs(parseInt(timeUTCshift / 60.0, 10));
    const minsShift = parseInt(Math.abs(timeUTCshift) - hoursShift * 60, 10);

    for (const el of response) {
      let label = el.date;
      let dat1 = el.date;

      if (timeUTCshift !== 0) {
        if (mode !== 'hour') {
          const arr = label.split(/[-\s:]/);

          // new Date(year, month, date, hours, minutes, seconds
          dat1 = new Date(+arr[0], +arr[1] - 1, +arr[2], +arr[3] || hoursShift, +arr[4] || minsShift, +arr[5] || 0);
        }

        const ts = dat1.getTime() + timeUTCshift * 60 * 1000;
        const dat2 = new Date();
        dat2.setTime(ts);

        label = dat2.toISOString().replace('T', ' ').split('.')[0];
        if (mode !== 'hour') label = label.split(' ')[0];
      } else if (mode === 'hour') label = el.date.toISOString().replace('T', ' ').split('.')[0];

      result.events.labels.push(label);
      result.events.total.push(Number(el.total || 0));
      result.events.filtered.push(Number(el.filtered_total || 0));

      result.users.labels.push(label);
      result.users.total.push(Number(el.users || 0));
      result.users.filtered.push(Number(el.filtered_users || 0));

      result.alerts.labels.push(label);
      result.alerts.total.push(Number(el.alerts || 0));
      result.alerts.filtered.push(Number(el.filtered_alerts || 0));
    }
    myCache.set(cacheKey, result);
    res.json(result);
  } else {
    res.json(value);
  }
};

// get events
exports.events = async (req, res) => {
  const eventsDataSchema = Joi.object({
    search: Joi.string().allow(null, ''),
    filter: Joi.string().regex(/(\d+(,?\s*)*)+/).allow(null, ''),
    period_min: Joi.date().iso().required(),
    period_max: Joi.date().iso().required(),
    time_type: Joi.string().valid('utc', 'local').required(),
    time_shift: Joi.number().integer().allow(null, ''),
    offset: Joi.number().integer().allow(null, ''),
    sort: Joi.valid('date', '-date').allow(null, ''),
  });

  const validation = eventsDataSchema.validate(req.query, { abortEarly: false });

  if (validation.error) {
    res.status(400).json({
      status: 'error',
      message: validation.error.details,
    });
    return;
  }

  const cacheKey = `${req.username}|${req.originalUrl}`;

  let value = myCache.get(cacheKey);
  if (value === undefined) {
    // handle miss!

    // set default values
    let defaults = {
      search: '', filter: '', time_shift: 0, offset: 0, sort: '',
    };
    Object.keys(defaults).forEach(key => { req.query[key] = req.query[key] || defaults[key]; });

    let {
      search, filter, time_type, time_shift: timeUTCshift, period_min, period_max, offset, sort: sortBy,
    } = req.query;

    const dat1 = parseInt(new Date(period_min).getTime() / 1000.0, 10);
    const dat2 = parseInt(new Date(period_max).getTime() / 1000.0, 10);

    if (dat1 > dat2) {
      res.status(400).json({
        status: 'error',
        message: [
          {
            message: '"period_min" cant be bigger then "period_max"',
            path: ['period_min', 'period_max'],
          }],
      });
      return;
    }

    const sqlQuery = `SELECT id as value, signal as label, description FROM report.signals where id in (${filter})`;
    let selectedFilters = [];
    if (filter !== '') {
      try {
        selectedFilters = await db.sequelize.query(sqlQuery, { type: QueryTypes.SELECT });
      } catch (err) {
        res.status(500).send({
          message:	err.message || 'Some SQL error occurred',
        });
        return;
      }
    }

    const filersStr = selectedFilters.reduce((accumulator, currentValue) => `${accumulator + (accumulator.length > 0 ? ', ' : '')}"${currentValue.label}"`, '');

    let timeTypeUTCshift = '';
    if (time_type === 'local') {
      if (timeUTCshift !== 0) timeTypeUTCshift = ` + INTERVAL '${timeUTCshift} minutes'`;
    } else {
      timeUTCshift = 0;
    }

    // chumk size
    const limit = 50;

    // select one more element for investigate: is we have more data?
    const biggerThenLimit = limit + 1;

    let query = `SELECT event
				FROM (SELECT event
					  FROM report.events
					  WHERE request_site = '${req.usersite}' -- straight defined filters
						AND date_trunc('hour', date) <= '${period_max}'::timestamp ${timeTypeUTCshift}
						AND date_trunc('hour', date) >= '${period_min}'::timestamp ${timeTypeUTCshift}`;

    if (filersStr !== '') {
      query += `
		AND '{ ${filersStr} }' && signals_array -- filter for signals
		`;
    }

    query += `
	  AND (request_id LIKE '%${search}%' OR  request_device_id LIKE '%${search}%' OR events.request_email LIKE '%${search}%' OR request_ip  LIKE '%${search}%')
	  `;

    if (sortBy === 'date') {
      query += `
		order by date
		`;
    }	else
    if (sortBy === '-date') {
      query += `
		order by date desc
		`;
    }

    query += `) as temp OFFSET ${offset} LIMIT ${biggerThenLimit}`;

    let response = [];
    try {
      response = await db.sequelize.query(query, { type: QueryTypes.SELECT });
    } catch (err) {
      res.status(500).send({
        message:	err.message || 'Some SQL error occurred',
      });
      return;
    }

    let next = null;
    if (response.length > limit) {
      const params = ['search', 'filter', 'period_min', 'period_max', 'time_type', 'time_shift', 'offset', 'sort'];
      next = '/dashboard/table-events/?';
      let requests = '';
      for (const par of params) {
        let val = (par === 'offset') ? +req.query[par] + limit : req.query[par];
        requests += `${(requests.length > 0 ? '&' : '') + par}=${val}`;
      }

      next += requests;
      response.slice(0, limit - 1);
    }

    const results = [];
    for (const el of response) {
      if (timeUTCshift !== 0) {
        const arr = el.event.date.split(/[-\s:]/);

        // new Date(year, month, date, hours, minutes, seconds
        const dat1 = new Date(+arr[0], +arr[1] - 1, +arr[2], +arr[3], +arr[4], +arr[5] || 0);
        dat1.setTime(dat1.getTime() - dat1.getTimezoneOffset() * 60 * 1000);
        const ts = dat1.getTime() + timeUTCshift * 60 * 1000;

        const dat2 = new Date();
        dat2.setTime(ts);

        const newDate = dat2.toISOString().replace('T', ' ').split('.')[0];

        el.event.date = newDate;
      }

      results.push(el.event);
    }
    myCache.set(cacheKey, { next, results });
    res.json({ next, results });
  } else {
    res.json({ next: value.next, results: value.results });
  }
};

// get ONE event
exports.eventGetOne = async (req, res) => {
  const id = req.query.request_id || '';
  const checkRegExp = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;
  if (!id.match(checkRegExp)) {
    res.status(400).send({
      status: 'error',
      message: 'Wrong parameters',
    });
    return;
  }

  const cacheKey = `${req.username}|${req.originalUrl}`;

  let value = myCache.get(cacheKey);
  if (value === undefined) {
    // handle miss!

    const query = `SELECT request_id,
				   date,
				   json_agg(json_build_object(
						   'Email_IP', emailip,
						   'Email', email,
						   'Ip', ip,
						   'Device', device,
						   'Alerts', alerts,
						   'Score', score,
						   'Network', network)) OVER (PARTITION BY request_id) as response,
				   location                                                    as geo,
				   request                                                     as request,
				   signals
			FROM report.events
		WHERE request_id = '${id}'
		and request_site = '${req.usersite}'`;

    let response = [];
    try {
      response = await db.sequelize.query(query, { type: QueryTypes.SELECT });
    } catch (err) {
      res.status(500).send({
        message:	err.message || 'Some SQL error occurred',
      });
      return;
    }

    let result = {};
    if (response.length > 0) {
      result = response[0];

      // remap some keys
      const processedKeys = ['Email_IP', 'Email', 'Ip', 'Device', 'Network'];

      let processedKey = '';
      for (processedKey of processedKeys) {
        const remapped = [];
        const arr = result.response[0][processedKey];

        for (const key in arr) {
          remapped.push({ name: key, value: arr[key] });
        }
        result.response[0][processedKey] = remapped;
      }

      result.response = result.response[0];

      const tempDate = result.date.toISOString().split('.');
      result.date = tempDate[0];
    } else {
      res.status(404).send({
        message:	'wrong event id',
      });
      return;
    }
    myCache.set(cacheKey, result);
    res.json(result);
  } else {
    res.json(value);
  }
};
