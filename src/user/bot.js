import DB       from 'lowdb'
import FileSync from 'lowdb/adapters/FileSync'
import TeleBot  from 'telebot'
import {token}  from './token.js'
import Messages from './messages.js'
import WebHook  from '../bitrix24/webhook.js'

class UserBot {
  constructor() {
    let _ = this

    if (typeof(token) == 'undefined' || token == '')
      throw new Error('Error: You need to provide the bot token!')

    const adapter = new FileSync('./storage/users.json')

    _.db        = new DB(adapter)
    _.bot       = new TeleBot(token)
    _.webhook   = new WebHook()
    _.messages  = new Messages()
    _.parseHTML = {parseMode: 'html'}

    _.db.defaults({users: []}).write()

    _.data = {
      id  : null
    , dbId: null
    , name: {
        first: null
      , last : null
      }
    , msg: {
        fn     : null
      , type   : null
      , content: null
      }
    , username: null
    }

    _.prompt = {
      ask    : false
    , command: null
    , value  : null
    }
  }

  async getCRMLead(id) {
    return this.webhook.trigger('crm.lead.get', {id: id})
  }

  async addCRMLead(params) {
    return this.webhook.trigger('crm.lead.add', params)
  }

  async updateCRMLead(params) {
    return this.webhook.trigger('crm.lead.update', params)
  }

  async getCRMContact(id) {
    return this.webhook.trigger('crm.contact.get', {id: id})
  }

  async addCRMContact(params) {
    return this.webhook.trigger('crm.contact.add', params)
  }

  async updateCRMContact(params) {
    return this.webhook.trigger('crm.contact.update', params)
  }

  getMsgType(msg) {
    let type = ''

    if (typeof(msg.location) != 'undefined')
      type = 'location'
    else
    {
      if (typeof(msg.entities) == 'undefined')
        type = 'text'
      else
      {
        if (msg.entities[0].type == 'bot_command')
          type = 'command'
        else
          type = 'unknown'
      }
    }

    return type
  }

  getMsgContext(type, msg) {
    let ctx = null

    if (type == 'location')
      ctx = msg.location
    else
    {
      if (type == 'command')
      {
        let parsed = msg.text.split(' ')
        ctx = {
          value: parsed[0]
        , args : parsed.slice(1)
        }
      }
      else if (type == 'text')
        ctx = msg.text
      else
        ctx = msg
    }

    return ctx
  }

  saveGripe() {
    let _ = this

    const params  = {id: _.data.dbId, 'fields[COMMENTS]': _.prompt.value}

    _.updateCRMContact(params)
    .then(() => _.data.msg.fn.reply.text(_.messages.savedGripe))
    .catch(err => {
      console.log(err)
      return _.data.msg.fn.reply.text(_.messages.saveError)
    })

    _.prompt.ask = false
  }

  runStartCommand() {
    let _ = this

    _.getCRMContact(_.data.dbId)
    .then(data => {
      const result = data.result
          , params = {
            'fields[IM][0][VALUE_TYPE]' : 'TELEGRAM'
          , 'fields[WEB][0][VALUE_TYPE]': 'OTHER'

          , 'fields[IM][0][VALUE]' : _.data.username
          , 'fields[WEB][0][VALUE]': `https://telegram.me/${_.data.username}`

          , 'fields[NAME]'       : _.data.name.first
          , 'fields[SECOND_NAME]': ''
          , 'fields[LAST_NAME]'  : _.data.name.last
          , 'fields[TYPE_ID]'    : 'CLIENT'
          , 'fields[SOURCE_ID]'  : 'OTHER'

          , 'fields[SOURCE_DESCRIPTION]': `T-${_.data.id}`
          }

      if (typeof(result) == 'undefined')
      {
        _.addCRMContact(params)
        .then(data => {
          if (_.data.dbId == -1)
            _.db.get('users')
                .push({username: _.data.username, alias: data.result})
                .write()
          else
            _.db.get('users')
                .find({username: _.data.username})
                .assign({alias: data.result})
                .write()
        })
        .catch(err => {
          console.log(err)
          return _.data.msg.fn.reply.text(_.messages.registerError)
        })
      }
      else
      {
        _.updateCRMContact(_.data.dbId, params)
        .then()
        .catch(err => {
          console.log(err)
          return _.data.msg.fn.reply.text(_.messages.registerError)
        })
      }
    })
    .catch(err => {
      console.log(err)
      return _.data.msg.fn.reply.text(_.messages.internalError)
    })

    return _.bot.sendMessage(_.data.id, _.messages.welcome, _.parseHTML)
  }

  runHelpCommand() {
    let _ = this

    const topic = _.data.msg.content.args[0]

    if (typeof(topic) != 'undefined')
      return _.bot.sendMessage(
        _.data.id, _.messages.helpTopic(topic), _.parseHTML
      )
    else
      return _.bot.sendMessage(_.data.id, _.messages.help, _.parseHTML)
  }

  runCommand() {
    let _ = this

    switch (_.data.msg.content.value) {
      case '/start':
        _.runStartCommand()
        break
      case '/bantuan':
        _.runHelpCommand()
        break
      case '/perintah':
        return _.bot.sendMessage(_.data.id, _.messages.commands, _.parseHTML)
        break
      case '/keluhan':
        _.prompt.ask     = true
        _.prompt.command = _.data.msg.content.value

        return _.data.msg.fn.reply.text(_.messages.askGripe)
        break
      default:
        return _.bot.sendMessage(
          _.data.id
        , _.messages.unknownCommand(_.data.msg.content.value)
        , _.parseHTML
        )
    }
  }

  run() {
    let _ = this

    _.bot.on('*', (msg) => {
      const cmdType = _.getMsgType(msg)

      _.data = {
        id      : msg.from.id
      , username: msg.from.username
      , msg: {
          fn     : msg
        , type   : cmdType
        , content: _.getMsgContext(cmdType, msg)
        }
      , name: {
          first: msg.from.first_name
        , last : msg.from.last_name
        }
      }

      console.log(msg)

      _.data.dbId = _.db.get('users')
                        .find({username: _.data.username})
                        .value()
      _.data.dbId = typeof(_.data.dbId) == 'undefined' ? -1 : _.data.dbId.alias

      switch (_.data.msg.type)
      {
        case 'command':
          _.runCommand()
          break
        case 'text':
          if (_.prompt.ask)
          {
            _.prompt.value = _.data.msg.content
            switch(_.prompt.command)
            {
              case '/keluhan':
                _.saveGripe()
                break
              default:
                return _.data.msg.fn.reply.text(_.messages.unknow)
            }
          }
          else
            return _.data.msg.fn.reply.text(_.messages.unknow)
          break
        default:
          return _.data.msg.fn.reply.text(_.messages.unknow)
      }
    })

    _.bot.start()
  }
}

module.exports = UserBot
