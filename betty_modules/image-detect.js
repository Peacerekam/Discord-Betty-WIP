const rp = require('request-promise').defaults({ encoding: null })

let Betty = module.parent.exports

module.exports = {
	name: "image-detect",
	event: "",
	desc: "",
	run: async (bot, message, guilds, stats) => {
		
		try {
			
			if (!Betty.realtimeChannels.includes(message.channel.id)) return // detect images only for fully cached channels

			if (message.author.id == bot.user.id) return // ignore betty's posts
			
			// push embeds
			for (let j = 0; j < message.embeds.length; j++){
				
				let embed = message.embeds[j]
				
				if (embed.provider){
					if (embed.provider == "YouTube" || embed.provider == "pixiv") continue
				}
				
				let target = embed.image ? embed.image : embed.video ? embed.video : embed.thumbnail ? embed.thumbnail : null
				if (!target) continue // ignore non-media embeds
				
				// pixiv hardcode exceptions
				if (target.url.includes("pixiv_logo")) continue
				if (target.url.includes("decorate.php")) continue // npm install node-pixiv ... data.response[0].image_urls[i]
				
				//target.url = target.proxy_url
				
				try {
					await isImageUri(target.url)
					console.log("OK: " + target.url)
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
				
				// twitter case
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
				
				const insert = Betty.db.prepare(`INSERT OR IGNORE INTO "${message.channel.id}" (url, filename, author, id) VALUES (?, ?, ?, ?)`)
				insert.run(target.url, `${filename}.${ext}`, message.author.id, message.id)
				
				
				
				let formatedMessage = {
					id: message.id,
					url: target.url,
					author: message.author.id
				}
				
				Betty.tagModule.newTag(formatedMessage, message)
			}
			
			// push attachments
			for (let j = 0; j < message.attachments.length; j++){
				
				let attachment = message.attachments[j]
				
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
				
				const insert = Betty.db.prepare(`INSERT OR IGNORE INTO "${message.channel.id}" (url, filename, author, id) VALUES (?, ?, ?, ?)`)
				insert.run(attachment.url, `${filename}.${ext}`, message.author.id, message.id)
				
				
				
				let formatedMessage = {
					id: message.id,
					url: attachment.url,
					author: message.author.id
				}
				
				Betty.tagModule.newTag(formatedMessage, message)

			}

			
		} catch (e) {
			console.log("[*] Something went wrong:", e.message)
		}

	}
}

function isImageUri(url, cb) {
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