module.exports = {
	name: "reveal-help",
	event: "MESSAGE_REACTION_ADD",
	desc: "",
	run: async (bot, guilds, stats, reactionMessage, emoji, userID) => {
		
		return // disable for now




		try {
			
			if (bot.user.id == userID) return // ignore betty's reactions
			
			const message = await bot.getMessage(reactionMessage.channel.id, reactionMessage.id)
			
			if (bot.user.id != message.author.id) return // work only for betty's posts
			
			if (emoji.name == "❓" && message.embeds.length > 0){
				
				if (message.embeds[0].image) return
				
				if (message.embeds[0].author && 
					message.embeds[0].author.icon_url &&
					message.embeds[0].author.icon_url == "https://cdn.discordapp.com/emojis/610648407832395787.png"){
					
					await message.removeReactions()
					
					let tmpMsg = {
						content: message.content,
						embed: message.embeds[0]
					}
					
					if (tmpMsg.embed.fields){
						
						for (f of tmpMsg.embed.fields){
							if (f.value.includes("Download and run")){
								return
							}
						}
						
						let filename = tmpMsg.embed.fields[3] ? tmpMsg.embed.fields[3].value.slice(1).split("]")[0] : "urls.txt"
						
						let examples = 	'Download and run one of the scripts or...\n' +
										'use .txt file to download images from terminal:\n' +
										//'``for /f "delims=" %u in (' + filename + ') do curl -OL "%u"``\n' +
										'``xargs -n 1 curl -O < ' + filename + '``\n' +
										'``cat ' + filename + ' | wget -i``'
						
						tmpMsg.embed.fields.push({ name: "​", value: examples , inline: false })
						
						await message.edit(tmpMsg)
						
					}
					
					//tmpMsg.embed.image = { url: "https://cdn.discordapp.com/attachments/282208855289495554/669691075031728149/ps.png" }
					
				}
			}
			
		} catch (e) {
			console.log("[*] Something went wrong:", e)
		}

	}
}
