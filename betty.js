const Eris = require('eris')
const glob = require('glob')
const path = require('path')

const writeFileAtomic = require('write-file-atomically')
const Database = require('better-sqlite3')
const db = new Database('./betty_other/images.db', { verbose: a => console.log(`\x1b[35m${a}\x1b[0m`) }) // options.memory
//const db = new Database('./betty_other/images.db' ) // options.memory

let tagsJSON = require('./betty_other/tags.json')
let config = require('./config.json')
let prefix = config.prefix

let permalinkUpdater
let realtimeChannels = []
let bettyModules = {}
let progressMap = {}


glob.sync('./betty_modules/*.js').forEach( file => {
	let script = require( path.resolve( file ) )
	bettyModules[script.name] = script
})

let reactionModules = Object.values(bettyModules).filter( o => o.event == "MESSAGE_REACTION_ADD" )
let commandModules = Object.values(bettyModules).filter( o => o.event == "MESSAGE_CREATE" )

let tagModule = bettyModules["tag"]

module.exports.tagModule = tagModule
module.exports.tagsJSON = tagsJSON
module.exports.realtimeChannels = realtimeChannels
module.exports.progressMap = progressMap
module.exports.db = db

let bot = new Eris( config.token , {
	disableEveryone: true,
	getAllUsers: false,
	restMode: false,
	requestTimeout: 30000 // possibly delete it, needs testing
})

bot.connect()


bot.on('ready', async () => {
	
	/*
	bot.guilds.forEach( async (g) => {
		if (g.ownerID == bot.user.id){
			console.log(g.id)
			await g.delete()
			console.log("left...")
		}
	})
	return
	*/
	
	if (config.storageChannel == null){
		
		let storageGuild = await bot.createGuild( "[Betty] File Storage" )
		config.storageChannel = storageGuild.systemChannelID
		
		try {
			await writeFileAtomic('./config.json', JSON.stringify(config, null, 2)) //, { indent: 2 }
		} catch (e) {
			console.log("[*] Something went with config.json overwriting:", e.message)
		}
	}
	
    console.log(`\n[Betty] Logged into ${bot.guilds.size} guilds as ${bot.user.username} - ${bot.user.id}\n`)
	console.log(bot.guilds.map(g => `${g.id} : ${g.name} : ${g.memberCount}`))
	bot.editStatus("online", { name: `prefix: ${prefix}` })
	
	console.log('\n')
	
	const dbInit = db.prepare(`CREATE TABLE IF NOT EXISTS "permalinks" (targetChannel varchar(255) PRIMARY KEY, channelID varchar(255), messageID varchar(255))`)
	dbInit.run()
	
	const stmt = db.prepare(`SELECT name FROM sqlite_master WHERE type="table" AND name NOT LIKE "sqlite_%" AND name NOT LIKE "permalinks"`)
	const dbTables = stmt.all()
	
	//let channelsInDB = dbTables.map(c => bot.getChannel(c.name))
	
	let channelsInDB = []
	
	for (let i = 0; i < dbTables.length; i++){
		let ch = bot.getChannel(dbTables[i].name)
		
		if (ch) {
			channelsInDB.push(ch)
		} else {
			console.log(`\n\x1b[31m[Betty] consider removing the channel table: ${dbTables[i].name}\x1b[0m`)
		}
		
	}
	
	console.log('\n')
	channelsInDB.forEach( c => console.log(`\x1b[36m${c.id} ${c.guild.name.slice(0,11)}\x1b[0m:  ${c.name}`))
	console.log('\n')
	
	if (!tagsJSON.realtime) tagsJSON.realtime = {}
	
	for (let i = 0; i < channelsInDB.length; i++){
		// can be awaited but dont wanna
		bettyModules["fetch"].run(bot, null, null, null, channelsInDB[i].id)
	}
	
	permalinkUpdater = bettyModules["permalink"].updatePermalinks(bot)
	//transactionHandler = bettyModules["fetch"].transactionHandler()
	
})

bot.on("messageDelete", async (message) => {
	
	try {
		const findTable = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name="${message.channel.id}"`)
		const tbl = findTable.get()

		if (!tbl) return
		
		const findImage = db.prepare(`SELECT * FROM "${message.channel.id}" WHERE id = ?`)
		const img = findImage.get(message.id)
		
		if (img){
			const deleteImage = db.prepare(`DELETE FROM "${message.channel.id}" WHERE id = ${message.id}`)
			deleteImage.run()
		}
	} catch (e){
		console.log(e)
	}
	
})

bot.on("messageUpdate", async (message, oldMessage) => {
	if (!message.channel.guild || !message.author || !message.member) return // DM check, bot check, webhook check
	
	// embeds are constructed in this event
	bettyModules["image-detect"].run(bot, message, null, null)
})

bot.on('messageReactionAdd', async (reactionMessage, emoji, userID) => {
	if (bot.users.get(userID).bot) return // bot check (includes self)
		
	for (bettyModule of reactionModules){
		await bettyModule.run(bot, null, null, reactionMessage, emoji, userID)
	}
})

bot.on('messageCreate', async (message) => {
	if (!message.channel.guild || !message.author || !message.member) return // DM check, bot check, webhook check
	
	// works passively (no command needed)
	bettyModules["image-detect"].run(bot, message, null, null)
	
	if (message.author.bot) return
	
	if (message.content.startsWith(prefix)){
		let command = message.content.split(" ")[0].slice(prefix.length)
		let bettyModule = commandModules.find( c => c.name == command )
		
		if (bettyModule) {
			let moduleStatus = await bettyModule.run(bot, message, null, null)
			
			if (moduleStatus) {
				console.log(`[Betty][x] ${prefix}${bettyModule.name}: ${message.author.username} @ @ ${message.channel.guild.name}`)
				message.addReaction("❌")
			} else {
				console.log(`[Betty] ${prefix}${bettyModule.name}: ${message.author.username} @ ${message.channel.guild.name}`)
			}
		}
	}
})

bot.on('guildCreate', (guild) => {
	console.log(`[Betty] Joined a new guild ${guild.name} : ${guild.memberCount}`)
})

bot.on('guildDelete', (guild) => {
	console.log(`[Betty] Left ${guild.name} : ${guild.memberCount}`)
})

bot.on('disconnect', (error) => {
	console.log(`[Betty] Disconnected with error ${error}. Reconnecting...`)
	
	clearInterval(permalinkUpdater)
	//clearInterval(transactionHandler)
	
})

process.on('uncaughtException', function(err) {
    console.log('[!] Uncaught Exception: ', err)
})

process.on('unhandledRejection', (reason, promise) => {
	console.log('[!] Unhandled Rejection at:', reason.stack || reason)
})
