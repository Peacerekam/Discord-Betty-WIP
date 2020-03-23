const fs = require('fs')
const rp = require('request-promise') //.defaults({ encoding: null })
const writeFileAtomic = require('write-file-atomically')

const jsdom = require("jsdom")
const { JSDOM } = jsdom

let Betty = module.parent.exports
let gelbooruAPI = require('../config.json').gelbooru

let progressCd = []

/*
setInterval( async () => {
	
	try {
		await writeFileAtomic('./betty_other/tags.json', JSON.stringify(Betty.tagsJSON, null, 2)) //, { indent: 2 }
	} catch (e) {
		console.log("[*] Something went with tagsDB saving:", e.message)
	}
	
}, 60000) // 60000 ms = 1 min
*/

module.exports = {
	name: "tag",
	event: "MESSAGE_CREATE",
	desc: "Tagging fetched images & previewing stats",
	newTag: async (formatedMessage, message) => {
		
		try {
			
			if (!(message.channel.id in Betty.tagsJSON.realtime)) return
			
			// formatedMessage.id
			// formatedMessage.url
			// formatedMessage.author
			
			console.log("[Betty] new image tagging:")
			await updateTagsJSON(formatedMessage, message.channel.guild.id, message.channel.id)
			
		} catch (e){
			console.log(e)
		}
		
	},
	updateTags: async (channel) => {
		
		try {
			if (channel.id in Betty.tagsJSON.realtime && Betty.tagsJSON.realtime[channel.id] == false){
				console.log("[Betty] I am already tagging this channel...")
				return
			}
			
			console.log("[Betty] Updating tags for the channel: " + channel.name)
			
			Betty.tagsJSON.realtime[channel.id] = false
			
			const stmt = Betty.db.prepare(`SELECT * FROM "${channel.id}"`)
			const filteredMessages = stmt.all()
			
			for (let i = 0; i < filteredMessages.length; i++){
				
				if (Betty.tagsJSON.lastIDs && Betty.tagsJSON.lastIDs[channel.id]){
					if (Betty.tagsJSON.lastIDs[channel.id] >= filteredMessages[i].id){
						continue
					}
				}
				
				await updateTagsJSON(filteredMessages[i], channel.guild.id, channel.id)
				
				let progress = ((100 * i) / filteredMessages.length)
				progress = Math.round(progress * 100) / 100
				
				console.log(`[Betty] ${channel.name} progress: ${progress}% [${(i+1)}/${filteredMessages.length}]`)
			}
			
			Betty.tagsJSON.realtime[channel.id] = true
			Betty.tagsJSON.lastIDs[channel.id] = channel.lastMessageID
			
			try {
				await writeFileAtomic('./betty_other/tags.json', JSON.stringify(Betty.tagsJSON, null, 2)) //, { indent: 2 }
			} catch (e) {
				console.log("[*] Something went with tags.json saving:", e.message)
			}
			
			console.log("[Betty] Updating tags for the channel: " + channel.name + " -- FINISHED --")
			
		} catch (e){
			console.log(e)
		}
	},
	run: async (bot, message, guilds, stats) => {
		
		let reply
		
		try {
		
			let words = message.content.toLowerCase().split(" ")
			
			if ( words.length == 1 ) {
				await message.channel.createMessage( "```md\n# b?tag\n\n> list top tags (all/char/series)\nb?tag top\nb?tag top char\nb?tag top series\n\n> Add a mention to any of the above commands to do user-specific search, eg:\nb>tag top <@mention>\nb?tag top char <@mention>\nb?tag top series <@mention>\n\n> list top users for a specific tag\nb?tag <tag>\nb?tag megumin\n```" )
				return
			}
			
			if (message.channelMentions.length == 0) {
				if (words[1] && words[1] == "top"){
					if (words[2] && (words[2] == "char" || words[2] == "series") ){
						
						let guildID = message.channel.guild.id
						let guildTags = Object.entries(Betty.tagsJSON[guildID])
						let sortable = []
						
						let toSearch = words[2] == "char" ? "character" : "series"
						
						if (message.mentions.length > 0){
					
							let toSearchUser = message.mentions[0].id
							let result = guildTags.filter( t => (t[1].type == toSearch) && (toSearchUser in t[1].users) )
							
							for (let r of result){ sortable.push([r[0], r[1].users[toSearchUser]]) }
							sortable.sort((a, b) => { return b[1] - a[1] })
						
							let prettyToSearch = toSearch[0].toUpperCase() + toSearch.slice(1)
							let prettyMultiple = prettyToSearch + (words[2] == "char" ? "s" : "")
						
							let listLimit = sortable.length > 20 ? 20 : sortable.length
							
							let list =  "```py\n@ Top " + prettyMultiple + " posted by " + message.mentions[0].username + 
										"\n\n   #  " + prettyToSearch + " Name " + (words[2] == "char" ? "" : "   ") + "                      Posts"
							
							for (let i = 0; i < listLimit; i++){
								
								let displayName = sortable[i][0].slice(0,35)
								let posts = sortable[i][1]
								
								let placeSpacerString = i >= 9 ? "  " : "   "
								let nameSpacerString = " ".repeat(37 - displayName.length)
								
								list += `\n${placeSpacerString}${(i+1)}  ${displayName}${nameSpacerString}${posts}`
							}
							
							list += "```"
							
							message.channel.createMessage(list)
							return
						}
						
						
						let result = guildTags.filter( t => t[1].type == toSearch )
						
						for (let r of result){ sortable.push([r[0], sum(r[1].users)]) }
						sortable.sort((a, b) => { return b[1] - a[1] })
					
						let prettyToSearch = toSearch[0].toUpperCase() + toSearch.slice(1)
						let prettyMultiple = prettyToSearch + (words[2] == "char" ? "s" : "")
						
						let listLimit = sortable.length > 20 ? 20 : sortable.length
						
						let list =  "```py\n@ Top " + prettyMultiple + " posted on " + message.channel.guild.name + 
									"\n\n   #  " + prettyToSearch + " Name " + (words[2] == "char" ? "" : "   ") + "                      Posts   Top User"
						
						for (let i = 0; i < listLimit; i++){
							
							let topUser = topUserForTag(guildID, sortable[i][0])
							let topUserDisplay = bot.users.get(topUser[0]) ? bot.users.get(topUser[0]).username.slice(0,25) : topUser[0]
							
							let displayName = sortable[i][0].slice(0,35)
							let posts = sortable[i][1]
							
							let placeSpacerString = i >= 9 ? "  " : "   "
							let nameSpacerString = " ".repeat(37 - displayName.length)
							let postsSpacerString = " ".repeat(8 - (posts).toString().length)
							
							list += `\n${placeSpacerString}${(i+1)}  ${displayName}${nameSpacerString}${posts}${postsSpacerString}${topUserDisplay} (${topUser[1]})`
						}
						
						list += "```"
						
						message.channel.createMessage(list)
						return
					
					} else {
						
						let guildID = message.channel.guild.id
						let guildTags = Object.entries(Betty.tagsJSON[guildID])
						let sortable = []
						
						if (message.mentions.length > 0){
					
							let toSearch = message.mentions[0].id
							let result = guildTags.filter( t => (toSearch in t[1].users) )
							
							for (let r of result){ sortable.push([r[0], r[1].users[toSearch]]) }
							sortable.sort((a, b) => { return b[1] - a[1] })
						
							let listLimit = sortable.length > 20 ? 20 : sortable.length
							let list = "```py\n@ Top tags posted by " + message.mentions[0].username + "\n\n   #  Tag Name                             Posts"
							
							for (let i = 0; i < listLimit; i++){
								
								let topUser = topUserForTag(guildID, sortable[i][0])
								let topUserDisplay = bot.users.get(topUser[0]) ? bot.users.get(topUser[0]).username.slice(0,25) : topUser[0]
								
								let displayName = sortable[i][0].slice(0,35)
								let posts = sortable[i][1]
								
								let placeSpacerString = i >= 9 ? "  " : "   "
								let nameSpacerString = " ".repeat(37 - displayName.length)
								
								list += `\n${placeSpacerString}${(i+1)}  ${displayName}${nameSpacerString}${posts}`
							}
							
							list += "```"
							
							message.channel.createMessage(list)
							return
							
						}
						
						let result = guildTags
						
						for (let character of result){ sortable.push([character[0], sum(character[1].users)]) }
						sortable.sort((a, b) => { return b[1] - a[1] })
					
						let listLimit = sortable.length > 20 ? 20 : sortable.length
						let list = "```py\n@ Top tags posted on " + message.channel.guild.name + "\n\n   #  Tag Name                             Posts   Top User"
						
						for (let i = 0; i < listLimit; i++){
							
							let topUser = topUserForTag(guildID, sortable[i][0])
							let topUserDisplay = bot.users.get(topUser[0]) ? bot.users.get(topUser[0]).username.slice(0,25) : topUser[0]
							
							let displayName = sortable[i][0].slice(0,35)
							let posts = sortable[i][1]
							
							let placeSpacerString = i >= 9 ? "  " : "   "
							let nameSpacerString = " ".repeat(37 - displayName.length)
							let postsSpacerString = " ".repeat(8 - (posts).toString().length)
							
							list += `\n${placeSpacerString}${(i+1)}  ${displayName}${nameSpacerString}${posts}${postsSpacerString}${topUserDisplay} (${topUser[1]})`
						}
						
						list += "```"
						
						message.channel.createMessage(list)
						return
						
					}
					
				} else if (words[1]){
					
					let guildID = message.channel.guild.id
					let guildTags = Object.entries(Betty.tagsJSON[guildID])
					let sortable = []
					
					let result = guildTags.find( t => t[0] == words[1] )
					
					if (result){
						result = result[1].users
					} else {
						message.channel.createMessage("Couldn't find any users for this tag")
						return
					}
					
					for (let userID in result){ sortable.push([userID, result[userID]]) }
					sortable.sort((a, b) => { return b[1] - a[1] })
					
					let total = sum(result)
					
					let listLimit = sortable.length > 20 ? 20 : sortable.length
					let list = "```py\n@ Top posters for tag: " + words[1] + "\n\n   #  Username                 Posts      Percentage"
					
					for (let i = 0; i < listLimit; i++){
						let displayName = bot.users.get(sortable[i][0]) ? bot.users.get(sortable[i][0]).username.slice(0,25) : sortable[i][0]
						let posts = sortable[i][1].toString()
						let percentage = (posts * 100 / total).toFixed(2)
						
						let nameSpacerLenght = 25 - displayName.length;
						let nameSpacerString = " ".repeat(nameSpacerLenght)
						let placeSpacerString = i >= 9 ? "  " : "   "
						
						let postsSpacerLenght = 11 - posts.length;
						let postsSpacerString = " ".repeat(postsSpacerLenght)
						
						list += `\n${placeSpacerString}${(i+1)}  ${displayName}${nameSpacerString}${posts}${postsSpacerString}${percentage} %`
					}
					
					list += "```"
					
					message.channel.createMessage(list)
					return
				}
				
			} else if (message.channelMentions.length == 1) {
				if (!message.member.permission.has("administrator") && message.member.id != "153942038138585088") return
				

				const channel = message.channel.guild.channels.get(message.channelMentions[0])
				
				if (!Betty.realtimeChannels.includes(channel.id)){
					if (Betty.progressMap[channel.id] > 0){
						await message.channel.createMessage(`This channel in the middle of caching (${Betty.progressMap[channel.id]}%)`)
					} else {
						await message.channel.createMessage("This channel wasn't cached yet - use ``b?fetch``")
					}
					return
				} else {
					/// this whole thing will need something other than Betty.realtimeChannels to check, 
					/// since its using a different tech?
					//await message.channel.createMessage("Tags for this channel are already up to date")
					//return
				}
				
				reply = await message.channel.createMessage("...wait")
				
				const stmt = Betty.db.prepare(`SELECT * FROM "${channel.id}"`)
				const filteredMessages = stmt.all()
				
				
				
				if (!Betty.tagsJSON[channel.guild.id]){
					Betty.tagsJSON[channel.guild.id] = {}
				}
				
				if (!Betty.tagsJSON.realtime) Betty.tagsJSON.realtime = {}
				Betty.tagsJSON.realtime[channel.id] = false
				
				
				
				let counter = 0
				
				// for (let item of items){ /* ... */ }
				for (let i = 0; i < filteredMessages.length; i++){
					
					if (Betty.tagsJSON.lastIDs && Betty.tagsJSON.lastIDs[channel.id]){
						if (Betty.tagsJSON.lastIDs[channel.id] >= filteredMessages[i].id){
							counter++
							continue
						}
					}
					
					await updateTagsJSON(filteredMessages[i], message.channel.guild.id, channel.id)
					
					let progress = ((100 * i) / filteredMessages.length)
					progress = Math.round(progress * 100) / 100
					
					console.log(`[Betty] Progress: ${progress}% [${(i+1)}/${filteredMessages.length}]`)
					
					if (!progressCd.includes(channel.id)) {
						
						try {
							await reply.edit(`Tagging progress for <#${channel.id}>: ${progress}% [${(i+1)}/${filteredMessages.length}]`)
						} catch (e){
							// not important!
						}
						
						progressCd.push(channel.id)
						progressCd.delayedRemove(channel.id, 3000)
					}
					
				}
				
				if (counter == filteredMessages.length){
					await reply.edit("Channel seems to be up to date already. Try ``b?tag top`` / ``b?tag top char`` / ``b?tag top series``")
				} else {
					Betty.tagsJSON.realtime[channel.id] = true
					await reply.edit("Finished tagging! Try ``b?tag top`` / ``b?tag top char`` / ``b?tag top series``")
				}
				
				try {
					Betty.tagsJSON.lastIDs[channel.id] = channel.lastMessageID
					await writeFileAtomic('./betty_other/tags.json', JSON.stringify(Betty.tagsJSON, null, 2)) //, { indent: 2 }
				} catch (e) {
					console.log("[*] Something went with tags.json saving:", e.message)
				}
				
				return
				
			}

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
				console.log("[*] Something went wrong #2:", e.message)
			}
		}

	}
}

// init.tagging.fetching

function updateTagsJSON(message, guildID, channelID){
	return new Promise( async (resolve, reject) => {
		
		try {
			
			let entry = await iqdb(message, guildID)
			
			if (entry){
				//console.log(JSON.stringify(entry, null,2))
				
				if (entry.res.characters.length == 0 && entry.res.series.length == 0){
					console.log("\nGelbooru tags:")
					console.log(entry.res.general)
				} else {
					console.log("\nDanbooru tags (& more):")
					console.log(entry.res.characters)
					console.log(entry.res.series)
				}

				// entry.userID
				// entry.channelID
				// entry.guildID
				// entry.res.general
				// entry.res.characters
				// entry.res.series
				// entry.res.rating
				
				if (message.id && channelID) {
					if (!Betty.tagsJSON.lastIDs) 
						Betty.tagsJSON.lastIDs = {}
					
					if (Betty.tagsJSON.lastIDs[channelID] < message.id)
						Betty.tagsJSON.lastIDs[channelID] = message.id
					
				}
				
				// update character tags
				for (let tag of entry.res.characters){
					
					if (!Betty.tagsJSON[guildID][tag]){
						Betty.tagsJSON[guildID][tag] = {
							type: null,
							users: {}
						}
					}
					
					if (Betty.tagsJSON[guildID][tag].type == null){
						Betty.tagsJSON[guildID][tag].type = "character"
					}

					if (Betty.tagsJSON[guildID][tag].users[entry.userID] == null){
						Betty.tagsJSON[guildID][tag].users[entry.userID] = 1
					} else {
						Betty.tagsJSON[guildID][tag].users[entry.userID]++
					}
				}
				
				// update series tags
				for (let tag of entry.res.series){
					

					if (!Betty.tagsJSON[guildID][tag]){
						Betty.tagsJSON[guildID][tag] = {
							type: null,
							users: {}
						}
					}
					
					if (Betty.tagsJSON[guildID][tag].type == null){
						Betty.tagsJSON[guildID][tag].type = "series"
					}

					if (Betty.tagsJSON[guildID][tag].users[entry.userID] == null){
						Betty.tagsJSON[guildID][tag].users[entry.userID] = 1
					} else {
						Betty.tagsJSON[guildID][tag].users[entry.userID]++
					}
				}
				
				// update rest of the tags
				for (let tag of entry.res.general){
					
					if (!Betty.tagsJSON[guildID][tag]){
						Betty.tagsJSON[guildID][tag] = {
							type: null,
							users: {}
						}
					}
					
					if (Betty.tagsJSON[guildID][tag].users[entry.userID] == null){
						Betty.tagsJSON[guildID][tag].users[entry.userID] = 1
					} else {
						Betty.tagsJSON[guildID][tag].users[entry.userID]++
					}
				}
			}
			
			try {
				await writeFileAtomic('./betty_other/tags.json', JSON.stringify(Betty.tagsJSON, null, 2)) //, { indent: 2 }
			} catch (e) {
				console.log("[*] Something went with tags.json saving:", e.message)
			}
	
			//console.log(Betty.tagsJSON)
			resolve()
			
		} catch (e){
			reject(e)
		}
	})
}

function iqdb(message, guildID){
	return new Promise( async (resolve, reject) => {

		let imgExt = [ '.png', '.gif', '.jpg', '.jpeg' ]
		let data = null

		// message.id
		// message.url
		// message.author
		
		let extFlag = null
		
		for (let ext of imgExt){
			if (message.url.toLowerCase().includes(ext)){
				extFlag = ext
			}
		}

		//console.log("  " + message.channel.guild.name + "  |  #" + message.channel.name)
		
		if (extFlag){
			console.log("[Betty] tagging: " + message.url )
			
			let res = await iqdbSearch(message, guildID)
			//console.log(res)
			
			if (res) {
				data = {
					userID: message.author,
					//channelID: channelID,
					guildID: guildID,
					res: res
				}
			}
		} else {
			console.log("[Betty] not an image: " + message.url )
		}
		
		resolve(data)
		
	})
}

function iqdbSearch(message, guildID){
	return new Promise( async (resolve, reject) => {
		
		let imageUrl = message.url
		
		if (imageUrl.startsWith("https://images-ext") && 
			imageUrl.includes("twimg.com/media/") && 
			imageUrl.endsWith("%3Alarge")){
			
			// old fetching was taking proxy url for twitter images
			// but iqdb has problems with it, so i gotta change it into
			// regular twitter link
			
			// https://images-ext-1.discordapp.net/external/U6qIKPXKKXknxQKAQTyapUb8_vSXuWb1rM5XNvsmBDA/https/pbs.twimg.com/media/DR_9YePUMAAedXC.jpg%3Alarge
			//   =>
			// https://pbs.twimg.com/media/DR_9YePUMAAedXC.jpg
			
			let tmpSplit = imageUrl.split("twimg.com/media/")
			let filename = tmpSplit[1].replace("%3Alarge","")
			imageUrl = `https://pbs.twimg.com/media/${filename}`
		}
		
		let doc
		
		try {
			let iqdbBody = await rp.post( `https://iqdb.org?MAX_FILE_SIZE=8388608&service[]=1&service[]=4&file=&url=${imageUrl}` )
			let dom = new JSDOM(iqdbBody)
			doc = dom.window.document
		} catch (e){
			console.log(e)
			resolve(null)
			return
		}
		
		let finalResult = null
		
		let selected = doc.querySelectorAll(".pages")
		let allMatches = []
		
		
		let err = doc.querySelector(".err")
		
		if (err){
			console.log(`[Betty] image tagger error: ${err.innerHTML}`)
			
			if (err.innerHTML.includes("Please try again")){
				console.log(`[Betty] Retrying...`)
				await updateTagsJSON(message, guildID)
			}
			
			if (err.innerHTML.includes("Whoops, can't connect to database")){
				console.log(`[Betty] Retrying...`)
				await updateTagsJSON(message, guildID)
			}
			
			resolve(null)
			return
		}
		
		for (let s of selected){
			for (let el of s.children){
				
				if (!el.children[0]) continue
				if (!el.children[0].children[0]) continue
				if (!el.children[0].children[0].children[0]) continue
				
				let current = el.children[0].children[0]
				
				if (current.children[0].textContent == "Best match" || current.children[0].textContent == "Additional match" ){
					
					let _sim = current.children[current.children.length-1].textContent.split("%")[0]
					let _booru = current.children[1].innerHTML.includes("danbooru") ? "dan" : current.children[1].innerHTML.includes("gelbooru") ? "gel" : null

					if (!_booru){
						continue
					}
					
					let _url = current.children[1].children[0].children[0].href.replace("//","")
					
					let tmp = {
						booru: _booru,
						similarity: _sim,
						url: _url
					}
					
					allMatches.push(tmp)
					
					
				}
				
			}
		}
		
		if (allMatches.length == 0){
			console.log(`[Betty] image tagger: no results found`)
			resolve(null)
			return
		}
		
		//console.log("all boorus:", allMatches)
		
		let filteredDan = allMatches.filter( m => m.booru == "dan" && m.similarity > 65)
		let filteredGel = allMatches.filter( m => m.booru == "gel" && m.similarity > 65)
		
		//console.log("danbooru:", filteredDan)
		//console.log("gelbooru:", filteredGel)
		
		
		if (filteredDan.length > 0){
			finalResult = await booruSearch(filteredDan[0].url)
		} else if (filteredGel.length > 0){
			finalResult = await booruSearch(filteredGel[0].url)
		}
		
		resolve(finalResult)
		
	})
}

function booruSearch(url){
	return new Promise( async (resolve, reject) => {
	
		if (url.includes("danbooru")){
			
			let booruAPI = `https://${url}.json`
			let booruJSON
			
			try {
				booruJSON = await rp.get( booruAPI )
			} catch (e){
				console.log(e)
				try {
					booruJSON = await rp.get( booruAPI )
				} catch (e){
					console.log(e)
					resolve(null)
				}
			}
		
			if (booruJSON){
				booruJSON = JSON.parse(booruJSON)
				
				//console.log(booruJSON.tag_string_general)
				//console.log(booruJSON.tag_string_character)
				//console.log(booruJSON.tag_string_copyright)
				
				let genTags = booruJSON.tag_string_general.split(" ")
				let charTags = booruJSON.tag_string_character.split(" ")
				let seriesTags = booruJSON.tag_string_copyright.split(" ")
				
				resolve({
					general: genTags != "" ? genTags : [],
					characters: charTags != "" ? charTags : [],
					series: seriesTags != "" ? seriesTags : [],
					rating: booruJSON.rating || "---"
				})
			}
			
		} else if (url.includes("gelbooru")){
			
			if (!url.includes("&id=")){
				resolve(null)
			}
			
			if (gelbooruAPI.key == null || gelbooruAPI.user == null){
				console.log("[Betty] no gelbooru API key/user in the config, ill skip this picture...")
				resolve(null)
			}
			
			let booruID = url.split("&id=")[1]
			let booruAPI = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&api_key=${gelbooruAPI.key}&user_id=${gelbooruAPI.user}&json=1&id=${booruID}` 
			let booruJSON
			
			try {
				booruJSON = await rp.get( booruAPI )
			} catch (e){
				console.log(e)
				try {
					booruJSON = await rp.get( booruAPI )
				} catch (e){
					console.log(e)
					resolve(null)
				}
			}
			
			if (booruJSON){
				booruJSON = JSON.parse(booruJSON)

				if (booruJSON[0] && booruJSON[0].tags){
					//console.log(booruJSON[0])
					let allTags = booruJSON[0].tags.split(" ")
					
					resolve({
						general: allTags != "" ? allTags : [],
						characters: [],
						series: [],
						rating: booruJSON[0].rating || "---"
					})
				}
			}
		}
		
		resolve(null)
	
	})
}

// filtering

function topUserForTag(guildID, tag){
	let guildTags = Object.entries(Betty.tagsJSON[guildID])
	let sortable = []
	
	let result = guildTags.find( t => t[0] == tag )
	
	if (result){
		result = result[1].users
	} else {
		return [ "---", "---" ]
	}
	
	for (let userID in result){ sortable.push([userID, result[userID]]) }
	sortable.sort((a, b) => { return b[1] - a[1] })
	
	if (sortable.length > 0){
		return sortable[0]
	} else {
		return [ "---", "---" ]
	}
}

function sum(obj) {
	let sum = 0
	for( let el in obj ) {
		if( obj.hasOwnProperty( el ) ) {
			sum += parseFloat( obj[el] )
		}
	}
	return sum
}

// utility

Array.prototype.delayedRemove = function(item, delay) {
    var target = this;
    
    setTimeout(() => {
        let index = target.indexOf(item);
        target.splice(index, 1);
    }, delay)
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