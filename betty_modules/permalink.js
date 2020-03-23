const fs = require('fs')

let Betty = module.parent.exports
let psTail = fs.readFileSync('./betty_other/powershell.tail')
let batchTail = fs.readFileSync('./betty_other/batchscript.tail')

module.exports = {
	name: "permalink",
	event: "MESSAGE_CREATE",
	desc: "This will leave a self-updating message with up to date images",
	run: async (bot, message, guilds, stats) => {
		
		let reply
		
		try {
		
			if (!message.member.permission.has("administrator")) return
			
			
			if (message.channelMentions.length != 1) return // incorrect format
			
			const channel = message.channel.guild.channels.get(message.channelMentions[0])
			
			if (!Betty.realtimeChannels.includes(channel.id)){
				if (Betty.progressMap[channel.id] > 0){
					await message.channel.createMessage(`This channel in the middle of caching (${Betty.progressMap[channel.id]}%)`)
				} else {
					await message.channel.createMessage("This channel wasn't cached yet - use ``b?fetch``")
				}
				return
			}
			
			// create new table for permalinks if it doesn't exist
			
			const findPermalink = Betty.db.prepare(`SELECT * FROM "permalinks" WHERE targetChannel = ?`)
			const permalink = findPermalink.get(channel.id)
			
			if (permalink){
				try {
					
					let permalinkMsg = await bot.getMessage( permalink.channelID, permalink.messageID )
					let msgUrl = `https://discordapp.com/channels/${channel.guild.id}/${permalink.channelID}/${permalink.messageID}`
					await message.channel.createMessage(`<#${permalink.targetChannel}> already has a permalink:\n${msgUrl}\nIf you want to create a new permalink, delete that message with previous one`)
					return
					
				} catch (e){
					
					await message.channel.createMessage(`Previous permalink seems to be deleted. Creating a new one...`)
					
				}
			}
			
			//let words = message.content.split(" ")
			
			/*
			if ( words.length == 1 ) {
				await bot.createMessage( channel.id, "```md\n# Aaa\naaa\n```" )
				return
			}
			*/
			
			reply = await bot.createMessage( message.channel.id, {
				embed: {
					color: 0xff0000, // 0xffb216
					author: {
						icon_url: "https://cdn.discordapp.com/emojis/610648407832395787.png", 
						name: `Creating permalink`
					},
				}
			})
			
			
			const stmt = Betty.db.prepare(`SELECT * FROM "${channel.id}"`)
			const filteredMessages = stmt.all()
			
			
			let newName = channel.name.replace(/([^a-z0-9_]+)/gi, '') || "images"
			
			let storageChannel = require('../config.json').storageChannel
			
			let txtFile = buildTxtFile(filteredMessages)
			let txtUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.txt`, file: txtFile })
			let txtDownload = txtUpload.attachments[0].url
			
			let psScript = buildPSScript(filteredMessages, channel.id, newName)
			let psUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.ps1`, file: psScript })
			let psDownload = psUpload.attachments[0].url
			
			let batchScript = buildBatchScript(filteredMessages, newName)
			let batchUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.bat`, file: batchScript })
			let batchDownload = batchUpload.attachments[0].url
		
			let today = new Date()
			let todaySplit = today.toString().split(" ")
			
			let embedColor = 0xff0000
			
			// Puella Magi Grief Magica
			if (channel.name == "madoka") embedColor = 0xee90ea
			if (channel.name == "kyouko") embedColor = 0xc70000
			if (channel.name == "sayaka") embedColor = 0x3498db
			if (channel.name == "homura") embedColor = 0x9b59b6
			if (channel.name == "mami") embedColor = 0xf0f030
			
			// Madoka's Disciples
			if (channel.guild.id == "503333746800590858") embedColor = 0xffb6c1
			
			await reply.edit({
				embed: {
					color: embedColor, // 0xffb216
					thumbnail: { url: filteredMessages[filteredMessages.length-1].url },
					author: {
						icon_url: "https://cdn.discordapp.com/emojis/610648407832395787.png", 
						name: `#${channel.name} permalink - ${todaySplit[2]} ${todaySplit[1]} ${todaySplit[3]}`
					},
					fields: [{
						name: "Channel", value: `<#${channel.id}>`, inline: true
					},{
						name: "Files", value: filteredMessages.length, inline: true
					},{
						name: "​", value: "​", inline: true // ${(psUpload.attachments[0].size/1024).toFixed(2)} KB
					},{
						name: ".txt file", value: `[${newName}-dl.txt](${txtDownload})`, inline: true
					},{
						name: "PowerShell (fast)", value: `[${newName}-dl.ps1](${psDownload})`, inline: true
					},{
						name: "Batch (slower)", value: `[${newName}-dl.bat](${batchDownload})`, inline: true
					}],
					footer: { text: "Last updated" },
					timestamp: today
				}
			})
			
			const insert = Betty.db.prepare(`INSERT OR REPLACE INTO "permalinks" (targetChannel, channelID, messageID) VALUES (?, ?, ?)`)
			insert.run(channel.id, reply.channel.id, reply.id)
			
			//await reply.addReaction("❓")
			
			
		} catch (e) {
			
			
			try {
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

	},
	updatePermalinks: (bot) => {
		
		return setInterval( async () => {
			const findPermalinks = Betty.db.prepare(`SELECT * FROM "permalinks"`)
			const permalinks = findPermalinks.all()
			
			for (pl of permalinks){
				//await bettyModules["permalink"].updatePermalink(bot, pl)
				await updatePermalink(bot, pl)
			}
		}, 300000) // 300000ms = 5min
		
	}
}

async function updatePermalink(bot, pl){
	
	try {
		
		const stmt = Betty.db.prepare(`SELECT * FROM "${pl.targetChannel}"`)
		const filteredMessages = stmt.all()
		
		let channel = bot.getChannel(pl.targetChannel)
		
		if (!channel) {
			console.log(`\n\x1b[31m[Betty] consider removing the permalink: ${pl.targetChannel}\x1b[0m`)
			return
		}

		let permalinkMsg = await bot.getMessage(pl.channelID, pl.messageID)
		let tmpEmbed = permalinkMsg.embeds[0]

		if (tmpEmbed.fields[1].value == filteredMessages.length) {
			return
		}

		console.log(`[Betty] Updating permalink for: #${channel.name}`)

		let newName = channel.name.replace(/([^a-z0-9_]+)/gi, '') || "images"
		
		let storageChannel = require('../config.json').storageChannel

		let txtFile = buildTxtFile(filteredMessages)
		let txtUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.txt`, file: txtFile })
		let txtDownload = txtUpload.attachments[0].url
		
		let psScript = buildPSScript(filteredMessages, channel.id, newName)
		let psUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.ps1`, file: psScript })
		let psDownload = psUpload.attachments[0].url
		
		let batchScript = buildBatchScript(filteredMessages, newName)
		let batchUpload = await bot.getChannel(storageChannel).createMessage( "", { name: `${newName}-dl.bat`, file: batchScript })
		let batchDownload = batchUpload.attachments[0].url
		
		let today = new Date()
		let todaySplit = today.toString().split(" ")
		
		tmpEmbed.author.name = `#${channel.name} permalink - ${todaySplit[2]} ${todaySplit[1]} ${todaySplit[3]}`
		
		tmpEmbed.thumbnail.url = filteredMessages[filteredMessages.length-1].url
		tmpEmbed.fields[1].value = filteredMessages.length
		
		tmpEmbed.fields[3].value = `[${newName}-dl.txt](${txtDownload})`
		tmpEmbed.fields[4].value = `[${newName}-dl.ps1](${psDownload})`
		tmpEmbed.fields[5].value = `[${newName}-dl.bat](${batchDownload})`
		
		tmpEmbed.timestamp = new Date()
		
		await permalinkMsg.edit({ embed: tmpEmbed })
		
	} catch (e){
		console.log(e)
	}
	
}

function buildTxtFile(items){
	
	let head = ""

	//for (let i = 0; i < items.length; i++) head +=	`url="${items[i].url}"\n`
	for (let i = 0; i < items.length; i++) head +=	`${items[i].url}\n`

	return head
	
}

function buildBatchScript(items, name){
	
	let head = "@echo off\nSETLOCAL EnableDelayedExpansion\n"

	for (let i = 0; i < items.length; i++){
		
		head +=	`\nset url_list[${i}]=${items[i].url}\nset filenames[${i}]=${items[i].filename}\n`
		
	}

	return (head + batchTail.toString().replace("CHANNEL_NAME", name).replace("FILES_COUNT", items.length))
	
}

function buildPSScript(items, id, name){
	let head = "$data = @("

	for (let i = 0; i < items.length; i++){
		
		head +=	`\n  [PSCustomObject]@{\n    Url = "${items[i].url}"\n    Filename = "${items[i].filename}"\n  }`
		
		if (i != (items.length - 1)) head += ","
		
	}

	head += "\n)\n\n"

	return (head + psTail.toString().replace("CHANNEL_ID", id).replace("CHANNEL_NAME", name))
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