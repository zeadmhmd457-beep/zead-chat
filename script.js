{
  "rules": {
    ".read": false,
    ".write": false,

    "publicUsers": {
      ".read": "auth != null",
      "$uid": {
        ".write": "auth != null && auth.uid === $uid"
      }
    },

    "chats": {
      "$chatId": {
        "members": {
          ".read": "auth != null && data.child(auth.uid).val() === true",
          ".write": "auth != null && !data.exists() && newData.child(auth.uid).val() === true && newData.numChildren() === 2"
        },
        "messages": {
          ".read": "auth != null && root.child('chats').child($chatId).child('members').child(auth.uid).val() === true",
          "$messageId": {
            ".write": "auth != null && root.child('chats').child($chatId).child('members').child(auth.uid).val() === true && !data.exists() && newData.child('sender').val() === auth.uid",
            ".validate": "newData.hasChildren(['sender', 'text', 'createdAt']) && newData.child('text').isString() && newData.child('text').val().length <= 2000"
          }
        }
      }
    },

    "userChats": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        "$chatId": {
          ".write": "auth != null && root.child('chats').child($chatId).child('members').child($uid).val() === true && root.child('chats').child($chatId).child('members').child(auth.uid).val() === true",
          ".validate": "newData.val() === true"
        }
      }
    }
  }
            }
