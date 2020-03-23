const rp = require('request-promise').defaults({ encoding: null })

let Betty = module.parent.exports
let cooldown = []
let progressCd = []
//let formattedMessages = []

//let dbInit = Betty.db.prepare('CREATE TABLE IF NOT EXISTS ? (url varchar(255), filename varchar(255), author varchar(255), id INTEGER)')

module.exports = {
	name: "fetch",
	event: "MESSAGE_CREATE",
	desc: "Pushes all the images within channel into database & keeps it updated",
	run: async (bot, message, guilds, stats, forcedChannel) => {
		
		let reply
		let channel
		
		let dlCounter = {
			"total": 0,
			"image": 0,
			"video": 0,
			"other": 0
		}
		
		try {
			
			if (forcedChannel) {
				let timestamp = Date.now()
				let fakeID = (timestamp - 1420070400000) * 4194304

				message = {
					channel: { id: forcedChannel },
					id: fakeID,
					channelMentions: [ forcedChannel ]
				}
				
			} else {
				if (!message.member.permission.has("administrator") && message.member.id != "153942038138585088") return
					await message.channel.createMessage("You need to be an admin to use this command")
					return
				}
			}
		
			if (message.channelMentions.length != 1) return // incorrect format
			
			channel = bot.getChannel(message.channelMentions[0])
			
			if (!channel){
				await message.channel.createMessage("Incorrect channel mention?")
				return
			}
			
			if (!forcedChannel) {
				if (cooldown.includes(channel.id)){
					//const dm = await bot.users.get(message.author.id).getDMChannel()
					//await dm.createMessage( "aaa (x request / xx seconds / server)" )
					await message.channel.createMessage(`This channel is in the middle of caching (${Betty.progressMap[channel.id]}%)`)
					return
				}
				
				if (Betty.realtimeChannels.includes(channel.id)){
					await message.channel.createMessage("Database for this channel is already up to date")
					return
				}
				
			} else {
				if (Betty.realtimeChannels.includes(channel.id)){
					Betty.realtimeChannels.splice(Betty.realtimeChannels.indexOf(channel.id), 1)
				} 
			}
			
			Betty.progressMap[channel.id] = 0
			
			cooldown.push(channel.id)
			//cooldown.splice(channel.id, 1)
			//cooldown.delayedRemove(channel.id, 1000) // 30000
			//let words = message.content.split(" ")
			
			
			/*
			if ( words.length == 1 ) {
				await bot.createMessage( channel.id, "```md\n# Aaa\naaa\n```" )
				return
			}
			*/
			
			if (!forcedChannel) {
				reply = await bot.createMessage( message.channel.id, "...wait")
			}
			
			// create new table for the channel if it doesn't exist
			const dbInit = Betty.db.prepare(`CREATE TABLE IF NOT EXISTS "${channel.id}" (url varchar(255) PRIMARY KEY, filename varchar(255), author varchar(255), id varchar(255))`)
			dbInit.run()
			
			// check highest messageID and start from there
			const findLastMsg = Betty.db.prepare(`SELECT MAX(id) as id FROM "${channel.id}"`)
			const latestMsg = findLastMsg.get()
			
			let firstMsg = null
			let nextMsg = { id: latestMsg.id || 0 }
			//let messages = []
			
			while (true){
				
				let messages = await bot.getMessages( channel.id, 100, null, nextMsg.id )
				
				//console.log(nextMsg.id + " Grabbing messages...")
				
				if (messages.length == 0) break
				
				messages.reverse()
				
				let wasUpdated = false
				
				for (let i = 0; i < messages.length; i++){
					
					if (messages[i].author.id == bot.user.id) continue // ignore betty's posts
					
					if (firstMsg == null) {
						firstMsg = messages[i]
					}
					
					Betty.progressMap[channel.id] = estimateProgress(message.id, firstMsg.id, messages[i].id)
					if (i % 5 == 0) console.log(`${channel.name} : \x1b[36m${Betty.progressMap[channel.id]}%\x1b[0m`)
					
					// push embeds
					for (let j = 0; j < messages[i].embeds.length; j++){
						
						let embed = messages[i].embeds[j]
						
						if (embed.provider){
							if (embed.provider == "YouTube" || embed.provider == "pixiv") continue
						}
						
						let target = embed.image ? embed.image : embed.video ? embed.video : embed.thumbnail ? embed.thumbnail : null
						if (!target) continue // ignore non-media embeds
						
						// pixiv hardcode exceptions
						if (target.url.includes("pixiv_logo")) continue
						if (target.url.includes("decorate.php")) continue // npm install node-pixiv => data.response[0].image_urls[i]
						
						// this was all good but it messes up with tagging system, so im yeeting it
						//target.url = target.proxy_url
						
						try {
							await isImageUri(target.url)
							//console.log("OK: " + target.url)
						} catch (e){
							console.log(e, "failed to get the picture")
							continue
						}
						
						let splitName = target.url.split("/").slice(-1).pop().split(".")
						if (splitName.length == 1) splitName.push("png") 
						
						let filename = splitName[splitName.length-2].toLowerCase()
						let ext = splitName[splitName.length-1].toLowerCase()
						
						// image server resize case
						if (ext.includes('?')) ext = ext.split('?')[0] // cuts off parameters like ?width=700 etc
						if (target.url.includes('?')) target.url = target.url.split('?')[0] // cuts off parameters like ?width=700 etc
						
						// twitter case for ext
						if (ext.includes(':')) ext = ext.split(':')[0] // cuts off :large etc 
						if (ext.includes('%3A')) ext = ext.split('%3A')[0] // proxy url is silly
						
						// twitter case for url
						if (target.url.includes("twimg.com/media/")) target.url = target.url.replace(":large", ":orig")
						//target.url = target.url.replace(":orig", "") // cuts off :orig etc --->> lastInfexOf + slice
						//if (target.url.includes('%3a')) target.url = target.url.split('%3a')[0] // proxy url is silly
						
						// avoid special chars, shouldnt be an issue but who the hell knows
						filename = filename.replace(/([^a-z0-9_]+)/gi, '')
						ext = ext.replace(/([^a-z0-9_]+)/gi, '')
						
						// ugly path clip (due to 259 windows path length limit), not a real solution but in case of some bizzare urls it should help to some degree
						if (ext.length > 5) 		ext = ext.slice(0,5) 
						if (filename.length > 100) 	filename = filename.slice(0,100) 
						
						
						/*
						formattedMessages.push({
							tableName: channel.id,
							url: target.url,
							filename: `${filename}.${ext}`,
							author: messages[i].author.id,
							//channel: messages[i].channel.id,
							id: messages[i].id
						})
						*/
						
						
						
						//const insert = Betty.db.prepare(`INSERT INTO "${channel.id}" (url, filename, author, id) VALUES (@url, @filename, @author, @id)`);
						const insert = Betty.db.prepare(`INSERT OR IGNORE INTO "${channel.id}" (url, filename, author, id) VALUES (?, ?, ?, ?)`)
						insert.run(target.url, `${filename}.${ext}`, messages[i].author.id, messages[i].id)
						
						wasUpdated = true

						//dlCounter[embed.type]++
						dlCounter["total"]++
						
					}
					
					// push attachments
					for (let j = 0; j < messages[i].attachments.length; j++){
							
						let attachment = messages[i].attachments[j]
						
						//let isMedia = await isImageUri(attachment.url)
						//if (!isMedia) continue // dead link, i dont think attachments can ever really die but...
						
						let imgExt = [ 'png', 'gif', 'jpg', 'jpeg' ]
						let vidExt = [ 'mp4', 'webm', 'webp' ]
						
						let splitName = attachment.url.split("/").slice(-1).pop().split(".")
						if (splitName.length == 1) splitName.push("png") 
						
						let filename = splitName[splitName.length-2].toLowerCase() 
						let ext = splitName[splitName.length-1].toLowerCase()
						
						!imgExt.includes(ext) && !vidExt.includes(ext) ? dlCounter["other"]++ : null
						vidExt.includes(ext) ? dlCounter["video"]++ : null
						
						
						/*
						formattedMessages.push({
							tableName: channel.id,
							url: attachment.url,
							filename: `${filename}.${ext}`,
							author: messages[i].author.id,
							//channel: messages[i].channel.id,
							id: messages[i].id
						})
						*/
						
						

						//const insert = Betty.db.prepare(`INSERT INTO "${channel.id}" (url, filename, author, id) VALUES (@url, @filename, @author, @id)`);
						const insert = Betty.db.prepare(`INSERT OR IGNORE INTO "${channel.id}" (url, filename, author, id) VALUES (?, ?, ?, ?)`)
						insert.run(attachment.url, `${filename}.${ext}`, messages[i].author.id, messages[i].id)
						
						wasUpdated = true
						
						if (imgExt.includes(ext)) {
							dlCounter["image"]++ 
						}
						
						dlCounter["total"]++
					}
					
					nextMsg = messages[messages.length-1]
				}
				
				if (!forcedChannel && wasUpdated && !progressCd.includes(channel.id)) {
					// dont await cuz it would slow down the fetching needlessly
					await reply.edit(`Estimated fetching progress for <#${channel.id}>: ${Betty.progressMap[channel.id]}%`)
					progressCd.push(channel.id)
					progressCd.delayedRemove(channel.id, 1500)
				}
			}
			
			if (!forcedChannel) {
				if (dlCounter["total"] == 0){
					await reply.edit({
						content: "<@" + message.author.id + ">",
						embed: {
							color: 0xff0000,
							author: {
								icon_url: "https://cdn.discordapp.com/emojis/474256522550181918.png", 
								name: "Couldn't find any (new) media in the channel"
							}
						}
					})
				} else {
					await reply.edit("Finished! " + `${dlCounter["total"]} media found` )
				}
			} else {
				if (forcedChannel in Betty.tagsJSON.realtime){
					let channelObj = bot.getChannel(forcedChannel)
					Betty.tagModule.updateTags(channelObj)
				}
			}
			
			console.log(`\x1b[36m#${channel.name}\x1b[0m is ready`)
			
			Betty.realtimeChannels.push(channel.id)
			Betty.progressMap[channel.id] = 0
			//cooldown.delayedRemove(channel.id, 1000) // 30000
			cooldown.splice(cooldown.indexOf(channel.id), 1)
			
		} catch (e) {
			try {
				console.log("[*] Something went wrong #1:", e)
				
				if (!forcedChannel) {
					reply.edit("...something interrupted me, but I still managed to add " + `${dlCounter["total"]} media to the db` )
				}
				
				Betty.progressMap[channel.id] = 0
				//cooldown.delayedRemove(channel.id, 1000) // 30000
				cooldown.splice(cooldown.indexOf(channel.id), 1)
				
			} catch (e) {
				console.log("[*] Something went wrong #2:", e)
			}
		}

	}
	/*,
	transactionHandler: () => {
		
		return setInterval( async () => {
			
			console.log("f-messages:", formattedMessages.length)
			
			if (formattedMessages.length > 0){

				//const separateConn = requireUncached('better-sqlite3')('./betty_other/test.db', { verbose: console.log }) // options.memory
				const insert = Betty.db.prepare(`INSERT OR IGNORE INTO (@tableName) (url, filename, author, id) VALUES (@url, @filename, @author, @id)`);

				const insertMany = Betty.db.transaction( items => {
					for (const item of items) insert.run(item);
				})

				insertMany(formattedMessages)
				
				//if (!forcedChannel) {
				//	await reply.edit(`Estimated progress for <#${channel.id}>: ${Betty.progressMap[channel.id]}%`)
				//}
				
				formattedMessages = [] // clear
			}
			
			
		}, 5000) // 300000ms = 5min
		
	}
	*/
}

function estimateProgress(now, start, then){
	
	//let now = (Date.now() - 1420070400000) * 4194304
	let n = now - start
	let t = then - start
	
	let result = t * 100 / n

	return Math.round(result * 100) / 100
}

function isImageUri(url) {
	return new Promise((resolve, reject) => {
		rp({ url: url, method: 'HEAD' }).then(res => {
			
			if (/4\d\d/.test(res.statusCode) === true) 
			{
				reject("404")
			}
			else if (res["content-type"].includes("image"))
			{
				resolve()
			}
			else if (res["content-type"].includes("video"))
			{
				resolve()
			}
			
			//console.log(res.statusCode, url, res["content-type"])
			
			reject("NOT-IMAGE")
			
		}).catch(err =>{
			reject(err.statusCode || "404?")
		})
	})
}


Array.prototype.delayedRemove = function(item, delay) {
    var target = this;
    
    setTimeout(() => {
        let index = target.indexOf(item);
        target.splice(index, 1);
    }, delay)
}
