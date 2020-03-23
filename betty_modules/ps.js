const fs = require('fs')

let Betty = module.parent.exports
let psTail = fs.readFileSync('./betty_other/powershell.tail')
let cooldown = []

module.exports = {
	name: "ps",
	event: "MESSAGE_CREATE",
	desc: "Gets  PowerShell script",
	run: async (bot, message, guilds, stats) => {
		
		return // disable for now
		
		
		
		
		
		let reply
		let channel
		
		try {
		
			if (message.channelMentions.length != 1) return // incorrect format
			
			channel = message.channel.guild.channels.get(message.channelMentions[0])
			
			if (!Betty.realtimeChannels.includes(channel.id)){
				if (Betty.progressMap[channel.id] > 0){
					await message.channel.createMessage(`This channel in the middle of caching (${Betty.progressMap[channel.id]}%)`)
				} else {
					await message.channel.createMessage("This channel wasn't cached yet")
				}
				return
			}
		
			if (cooldown.includes(channel.id)){
				const dm = await bot.users.get(message.author.id).getDMChannel()
				await dm.createMessage( "aaa (x request / xx seconds / server)" )
				return
			}
			
			cooldown.push(channel.id)
			//cooldown.splice(cooldown.indexOf(channel.id), 1)
			
			//let words = message.content.split(" ")
			
			/*
			if ( words.length == 1 ) {
				await bot.createMessage( channel.id, "```md\n# Aaa\naaa\n```" )
				return
			}
			*/
			
			reply = await bot.createMessage( message.channel.id, "...wait")
			
			
			const stmt = Betty.db.prepare(`SELECT * FROM "${channel.id}"`)
			const filteredMessages = stmt.all()
			
			//const stmt = Betty.db.prepare('SELECT * FROM "media" WHERE name = ?');
			//const filteredMessages = stmt.all('Joey');
			
			//let filteredMessages = formattedMessages;
			
			let psScript = buildPSScript(filteredMessages, channel.id, channel.name)
			
			let storageChannel = require('../config.json').storageChannel
		
			let fileUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${channel.name}.ps1`, file: psScript })
			let downloadLink = fileUpload.attachments[0].url
			console.log(filteredMessages[0])
			await reply.edit({
				content: "<@" + message.author.id + ">",
				embed: {
					color: 0xffb216,
					thumbnail: { url: filteredMessages[0].url },
					author: {
						icon_url: "https://cdn.discordapp.com/emojis/610648407832395787.png", 
						name: `Generated PowerShell Script with ${filteredMessages.length} URLs`
					},
					fields: [{
						name: "File size", value: `${(fileUpload.attachments[0].size/1024).toFixed(2)} KB`, inline: true
					},{
						name: "Download link", value: `[${channel.name}.ps1](${downloadLink})`, inline: true
					}]
				}
			})
			
			cooldown.splice(cooldown.indexOf(channel.id), 1)
			
			await reply.addReaction("❓")
			
			
		} catch (e) {
			
			try {
				cooldown.splice(cooldown.indexOf(channel.id), 1)
				
				console.log("[*] Something went wrong #1:", e)
				
				await reply.edit({
					content: "<@" + message.author.id + ">",
					embed: {
						color: 0xff0000,
						author: {
							icon_url: "https://cdn.discordapp.com/emojis/474256522550181918.png", 
							name: "Something broke: " + e.message
						}
					}
				})
				
				setTimeout(async () => {
					await bot.deleteMessage(reply.channel.id, reply.id)
				}, 10000); // 10000 ms = 10 seconds
				
			} catch (e) {
				console.log("[*] Something went wrong #2:", e)
			}
		}

	}
}

function buildPSScript(items, id, name){
	let head = "$data = @("

	for (let i = 0; i < items.length; i++){
		
		// no need, its actually pretty damn fast
		//console.log((((i+1) * 100) / (items.length)) + " %")
		
		head +=	`\n  [PSCustomObject]@{\n    Url = "${items[i].url}"\n    Filename = "${items[i].filename}"\n  }`
		
		if (i != (items.length - 1)) head += ","
		
	}

	head += "\n)\n\n"

	return (head + psTail.toString()).replace("CHANNEL_ID", id).replace("CHANNEL_NAME", name)
}

/*
String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search.replace(/[\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), replacement);
}

Array.prototype.delayedRemove = function(item, delay) {
    var target = this;
    
    setTimeout(() => {
        let index = target.indexOf(item);
        target.splice(index, 1);
    }, delay)
}
*/