'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _lowdb = require('lowdb');

var _lowdb2 = _interopRequireDefault(_lowdb);

var _FileSync = require('lowdb/adapters/FileSync');

var _FileSync2 = _interopRequireDefault(_FileSync);

var _telebot = require('telebot');

var _telebot2 = _interopRequireDefault(_telebot);

var _token = require('./token.js');

var _messages = require('./messages.js');

var _messages2 = _interopRequireDefault(_messages);

var _webhook = require('../bitrix24/webhook.js');

var _webhook2 = _interopRequireDefault(_webhook);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var UserBot = function () {
  function UserBot() {
    _classCallCheck(this, UserBot);

    var _ = this;

    if (typeof _token.token == 'undefined' || _token.token == '') throw new Error('Error: You need to provide the bot token!');

    var adapter = new _FileSync2.default('./storage/users.json');

    _.db = new _lowdb2.default(adapter);
    _.bot = new _telebot2.default(_token.token);
    _.webhook = new _webhook2.default();
    _.messages = new _messages2.default();
    _.parseHTML = { parseMode: 'html' };

    _.db.defaults({ users: [] }).write();

    _.data = {
      id: null,
      dbId: null,
      name: {
        first: null,
        last: null
      },
      msg: {
        fn: null,
        type: null,
        content: null
      },
      username: null
    };

    _.prompt = {
      ask: false,
      command: null,
      value: null
    };
  }

  _createClass(UserBot, [{
    key: 'getCRMLead',
    value: async function getCRMLead(id) {
      return this.webhook.trigger('crm.lead.get', { id: id });
    }
  }, {
    key: 'addCRMLead',
    value: async function addCRMLead(params) {
      return this.webhook.trigger('crm.lead.add', params);
    }
  }, {
    key: 'updateCRMLead',
    value: async function updateCRMLead(params) {
      return this.webhook.trigger('crm.lead.update', params);
    }
  }, {
    key: 'getCRMContact',
    value: async function getCRMContact(id) {
      return this.webhook.trigger('crm.contact.get', { id: id });
    }
  }, {
    key: 'addCRMContact',
    value: async function addCRMContact(params) {
      return this.webhook.trigger('crm.contact.add', params);
    }
  }, {
    key: 'updateCRMContact',
    value: async function updateCRMContact(params) {
      return this.webhook.trigger('crm.contact.update', params);
    }
  }, {
    key: 'getMsgType',
    value: function getMsgType(msg) {
      var type = '';

      if (typeof msg.location != 'undefined') type = 'location';else {
        if (typeof msg.entities == 'undefined') type = 'text';else {
          if (msg.entities[0].type == 'bot_command') type = 'command';else type = 'unknown';
        }
      }

      return type;
    }
  }, {
    key: 'getMsgContext',
    value: function getMsgContext(type, msg) {
      var ctx = null;

      if (type == 'location') ctx = msg.location;else {
        if (type == 'command') {
          var parsed = msg.text.split(' ');
          ctx = {
            value: parsed[0],
            args: parsed.slice(1)
          };
        } else if (type == 'text') ctx = msg.text;else ctx = msg;
      }

      return ctx;
    }
  }, {
    key: 'saveGripe',
    value: function saveGripe() {
      var _ = this;

      var params = { id: _.data.dbId, 'fields[COMMENTS]': _.prompt.value };

      _.updateCRMContact(params).then(function () {
        return _.data.msg.fn.reply.text(_.messages.savedGripe);
      }).catch(function (err) {
        console.log(err);
        return _.data.msg.fn.reply.text(_.messages.saveError);
      });

      _.prompt.ask = false;
    }
  }, {
    key: 'runStartCommand',
    value: function runStartCommand() {
      var _ = this;

      _.getCRMContact(_.data.dbId).then(function (data) {
        var result = data.result,
            params = {
          'fields[IM][0][VALUE_TYPE]': 'TELEGRAM',
          'fields[WEB][0][VALUE_TYPE]': 'OTHER',

          'fields[IM][0][VALUE]': _.data.username,
          'fields[WEB][0][VALUE]': 'https://telegram.me/' + _.data.username,

          'fields[NAME]': _.data.name.first,
          'fields[SECOND_NAME]': '',
          'fields[LAST_NAME]': _.data.name.last,
          'fields[TYPE_ID]': 'CLIENT',
          'fields[SOURCE_ID]': 'OTHER',

          'fields[SOURCE_DESCRIPTION]': 'T-' + _.data.id
        };

        if (typeof result == 'undefined') {
          _.addCRMContact(params).then(function (data) {
            if (_.data.dbId == -1) _.db.get('users').push({ username: _.data.username, alias: data.result }).write();else _.db.get('users').find({ username: _.data.username }).assign({ alias: data.result }).write();
          }).catch(function (err) {
            console.log(err);
            return _.data.msg.fn.reply.text(_.messages.registerError);
          });
        } else {
          _.updateCRMContact(_.data.dbId, params).then().catch(function (err) {
            console.log(err);
            return _.data.msg.fn.reply.text(_.messages.registerError);
          });
        }
      }).catch(function (err) {
        console.log(err);
        return _.data.msg.fn.reply.text(_.messages.internalError);
      });

      return _.bot.sendMessage(_.data.id, _.messages.welcome, _.parseHTML);
    }
  }, {
    key: 'runHelpCommand',
    value: function runHelpCommand() {
      var _ = this;

      var topic = _.data.msg.content.args[0];

      if (typeof topic != 'undefined') return _.bot.sendMessage(_.data.id, _.messages.helpTopic(topic), _.parseHTML);else return _.bot.sendMessage(_.data.id, _.messages.help, _.parseHTML);
    }
  }, {
    key: 'runCommand',
    value: function runCommand() {
      var _ = this;

      switch (_.data.msg.content.value) {
        case '/start':
          _.runStartCommand();
          break;
        case '/bantuan':
          _.runHelpCommand();
          break;
        case '/perintah':
          return _.bot.sendMessage(_.data.id, _.messages.commands, _.parseHTML);
          break;
        case '/keluhan':
          _.prompt.ask = true;
          _.prompt.command = _.data.msg.content.value;

          return _.bot.sendMessage(_.data.id, _.messages.askGripe, _.parseHTML);
          break;
        default:
          return _.bot.sendMessage(_.data.id, _.messages.unknownCommand(_.data.msg.content.value), _.parseHTML);
      }
    }
  }, {
    key: 'run',
    value: function run() {
      var _ = this;

      _.bot.on('*', function (msg) {
        var cmdType = _.getMsgType(msg);

        _.data = {
          id: msg.from.id,
          username: msg.from.username,
          msg: {
            fn: msg,
            type: cmdType,
            content: _.getMsgContext(cmdType, msg)
          },
          name: {
            first: msg.from.first_name,
            last: msg.from.last_name
          }
        };

        _.data.dbId = _.db.get('users').find({ username: _.data.username }).value();
        _.data.dbId = typeof _.data.dbId == 'undefined' ? -1 : _.data.dbId.alias;

        switch (_.data.msg.type) {
          case 'command':
            _.runCommand();
            break;
          case 'text':
            if (_.prompt.ask) {
              _.prompt.value = _.data.msg.content;
              switch (_.prompt.command) {
                case '/keluhan':
                  if (_.prompt.value == 'batal') {
                    _.prompt.ask = false;
                    return _.data.msg.fn.reply.text(_.messages.cancelAction);
                  } else _.saveGripe();
                  break;
                default:
                  return _.data.msg.fn.reply.text(_.messages.unknow);
              }
            } else return _.data.msg.fn.reply.text(_.messages.unknow);
            break;
          default:
            return _.data.msg.fn.reply.text(_.messages.unknow);
        }
      });

      _.bot.start();
    }
  }]);

  return UserBot;
}();

module.exports = UserBot;