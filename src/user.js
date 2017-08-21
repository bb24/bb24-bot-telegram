import Bot      from './user/bot.js'
import Messages from './user/messages.js'

class User {
  constructor() {
    let _ = this

    _.bot      = new Bot()
    _.messages = new Messages()
  }
}

module.exports = User
