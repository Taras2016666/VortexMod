import { Client, GatewayIntentBits, Message, TextChannel, GuildMember, EmbedBuilder, PermissionsBitField } from "discord.js"
import { BOT_TOKEN, PREFIX, OWNER_ID, LOG_CHANNEL_ID, BANNED_WORDS, WARN_LIMIT } from "./config"

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences
    ]
})

const warns: Record<string, number> = {}
const spamTracker: Record<string, { lastMsg: string, count: number, lastTime: number, caps: number, mentions: number }> = {}
const mutedUsers: Record<string, NodeJS.Timeout> = {}
const guildLang: Record<string, "ua" | "uk"> = {}
const userNotes: Record<string, string[]> = {}
const userJoinTime: Record<string, number> = {}
const MUTE_ROLE_NAME = "Muted"
const MUTE_TIME = 10 * 60 * 1000 // 10 хвилин

function logToChannel(client: Client, content: string, embed?: EmbedBuilder) {
    const channel = client.channels.cache.get(LOG_CHANNEL_ID) as TextChannel
    if (channel) {
        if (embed) channel.send({ content, embeds: [embed] }).catch(() => {})
        else channel.send(content).catch(() => {})
    }
}

function isBadWord(msg: string) {
    const words = msg.toLowerCase().split(/\s|[.,!?;:()"'`~@#$%^&*_\-+=/\\|[\]{}<>]/)
    return BANNED_WORDS.some(bw => words.includes(bw))
}

function isSpam(msg: Message) {
    if (msg.mentions.users.size >= 5) return true
    if (/(https?:\/\/|discord\.gg|t\.me|@everyone|@here)/i.test(msg.content)) return true
    const letters = msg.content.replace(/[^a-zа-яёіїєґ]/gi, "")
    if (letters.length > 8 && letters === letters.toUpperCase()) return true
    return false
}

async function muteMember(member: GuildMember, guildName: string) {
    let muteRole = member.guild.roles.cache.find(r => r.name === MUTE_ROLE_NAME)
    if (!muteRole) {
        muteRole = await member.guild.roles.create({
            name: MUTE_ROLE_NAME,
            color: "#888888",
            permissions: []
        })
        member.guild.channels.cache.forEach(async channel => {
            if (channel.isTextBased()) {
                await channel.permissionOverwrites.edit(muteRole!, { SendMessages: false }).catch(() => {})
            }
        })
    }
    await member.roles.add(muteRole)
    if (mutedUsers[member.id]) clearTimeout(mutedUsers[member.id])
    mutedUsers[member.id] = setTimeout(async () => {
        await member.roles.remove(muteRole!).catch(() => {})
    }, MUTE_TIME)
}

function getLang(guildId: string) {
    return guildLang[guildId] || "ua"
}

function t(key: string, lang: "ua" | "uk") {
    const dict: Record<string, { ua: string, uk: string }> = {
        pong: { ua: "🏓 Понг!", uk: "🏓 Pong!" },
        warns: { ua: "Попереджень у", uk: "Warnings for" },
        no_violators: { ua: "Немає порушників.", uk: "No violators." },
        top_violators: { ua: "**Топ-5 порушників:**", uk: "**Top 5 violators:**" },
        ban_mention: { ua: "Вкажіть користувача для бану.", uk: "Mention a user to ban." },
        banned: { ua: "забанений.", uk: "banned." },
        cant_ban: { ua: "Не можу забанити цього користувача.", uk: "Can't ban this user." },
        reset_mention: { ua: "Вкажіть користувача для скидання попереджень.", uk: "Mention a user to reset warnings." },
        reset_done: { ua: "Попередження для", uk: "Warnings for" },
        reset_done2: { ua: "скинуто.", uk: "reset." },
        help: {
            ua: `**Команди:**\n\`${PREFIX}ping\` — Перевірка роботи\n\`${PREFIX}warns [@user]\` — Переглянути попередження\n\`${PREFIX}topwarns\` — Топ-5 порушників\n${OWNER_ID ? `\`${PREFIX}ban @user\` — Бан користувача\n\`${PREFIX}resetwarns @user\` — Скинути попередження\n\`${PREFIX}unmute @user\` — Зняти мут\n\`${PREFIX}note @user текст\` — Додати нотатку\n\`${PREFIX}notes @user\` — Переглянути нотатки\n\`${PREFIX}clear @user\` — Очистити нотатки\n\`${PREFIX}userinfo [@user]\` — Інфо про користувача\n` : ""}\`${PREFIX}lang ua|uk\` — Змінити мову\n\`${PREFIX}help\` — Допомога`,
            uk: `**Commands:**\n\`${PREFIX}ping\` — Check bot\n\`${PREFIX}warns [@user]\` — View warnings\n\`${PREFIX}topwarns\` — Top 5 violators\n${OWNER_ID ? `\`${PREFIX}ban @user\` — Ban user\n\`${PREFIX}resetwarns @user\` — Reset warnings\n\`${PREFIX}unmute @user\` — Unmute user\n\`${PREFIX}note @user text\` — Add note\n\`${PREFIX}notes @user\` — View notes\n\`${PREFIX}clear @user\` — Clear notes\n\`${PREFIX}userinfo [@user]\` — User info\n` : ""}\`${PREFIX}lang ua|uk\` — Change language\n\`${PREFIX}help\` — Help`
        },
        lang_set_ua: { ua: "Мова встановлена: українська 🇺🇦", uk: "Language set: Ukrainian 🇺🇦" },
        lang_set_uk: { ua: "Мова встановлена: англійська 🇬🇧", uk: "Language set: English 🇬🇧" },
        muted: { ua: "отримав мут на 10 хвилин.", uk: "got muted for 10 minutes." },
        unmuted: { ua: "розм'ючений.", uk: "unmuted." },
        not_muted: { ua: "Користувач не в муті.", uk: "User is not muted." },
        status: { ua: "✅ Бот працює!", uk: "✅ Bot is online!" },
        note_added: { ua: "Нотатку додано.", uk: "Note added." },
        no_notes: { ua: "Нотаток немає.", uk: "No notes." },
        notes_cleared: { ua: "Нотатки очищено.", uk: "Notes cleared." },
        joined: { ua: "Приєднався", uk: "Joined" },
        roles: { ua: "Ролі", uk: "Roles" }
    }
    return dict[key]?.[lang] || key
}

client.on("ready", () => {
    console.log(`Logged in as ${client.user?.tag}!`)
    client.user?.setActivity("/help | moderation", { type: 0 })
})

client.on("guildMemberAdd", member => {
    userJoinTime[member.id] = Date.now()
})

client.on("messageCreate", async (message: Message) => {
    if (message.author.bot || !message.guild) return

    const lang = getLang(message.guild.id)
    const content = message.content

    // --- Антиспам ---
    const now = Date.now()
    const userSpam = spamTracker[message.author.id] || { lastMsg: "", count: 0, lastTime: 0, caps: 0, mentions: 0 }
    if (userSpam.lastMsg === content && now - userSpam.lastTime < 5000) {
        userSpam.count++
    } else {
        userSpam.count = 1
    }
    userSpam.lastMsg = content
    userSpam.lastTime = now
    userSpam.caps = (content.replace(/[^A-ZА-ЯЁІЇЄҐ]/g, "").length / (content.length || 1)) > 0.7 ? (userSpam.caps + 1) : 0
    userSpam.mentions = message.mentions.users.size
    spamTracker[message.author.id] = userSpam

    if (
        userSpam.count >= 4 ||
        userSpam.mentions >= 5 ||
        userSpam.caps >= 3 ||
        isSpam(message)
    ) {
        await message.delete().catch(() => {})
        warns[message.author.id] = (warns[message.author.id] || 0) + 1
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${message.author}, спам/флуд заборонено! Попередження: ${warns[message.author.id]}/${WARN_LIMIT}`)
                    .setColor("Orange")
            ]
        })
        logToChannel(client, "", new EmbedBuilder()
            .setTitle("Антиспам")
            .setDescription(`${message.author.tag} отримав попередження за спам/флуд`)
            .setColor("Orange")
        )
        if (warns[message.author.id] === WARN_LIMIT - 1) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null)
            if (member && member.manageable) {
                await muteMember(member, message.guild.name)
                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${message.author} ${t("muted", lang)}`)
                            .setColor("Yellow")
                    ]
                })
                logToChannel(client, "", new EmbedBuilder()
                    .setTitle("Мут")
                    .setDescription(`${message.author.tag} ${t("muted", lang)}`)
                    .setColor("Yellow")
                )
            }
        }
        if (warns[message.author.id] >= WARN_LIMIT) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null)
            if (member && member.bannable) {
                await member.ban({ reason: "Флуд/спам" })
                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${message.author} був забанений за флуд/спам.`)
                            .setColor("Red")
                    ]
                })
                logToChannel(client, "", new EmbedBuilder()
                    .setTitle("Бан за флуд")
                    .setDescription(`${message.author.tag} забанений за флуд/спам`)
                    .setColor("Red")
                )
            }
        }
        return
    }

    // --- Автомодерація ---
    if (isBadWord(content)) {
        await message.delete().catch(() => {})
        warns[message.author.id] = (warns[message.author.id] || 0) + 1
        await message.channel.send({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${message.author}, нецензурна лексика заборонена! Попередження: ${warns[message.author.id]}/${WARN_LIMIT}`)
                    .setColor("Red")
            ]
        })
        logToChannel(client, "", new EmbedBuilder()
            .setTitle("Автомодерація")
            .setDescription(`${message.author.tag} отримав попередження за нецензурну лексику`)
            .setColor("Red")
        )
        if (warns[message.author.id] === WARN_LIMIT - 1) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null)
            if (member && member.manageable) {
                await muteMember(member, message.guild.name)
                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${message.author} ${t("muted", lang)}`)
                            .setColor("Yellow")
                    ]
                })
                logToChannel(client, "", new EmbedBuilder()
                    .setTitle("Мут")
                    .setDescription(`${message.author.tag} ${t("muted", lang)}`)
                    .setColor("Yellow")
                )
            }
        }
        if (warns[message.author.id] >= WARN_LIMIT) {
            const member = await message.guild.members.fetch(message.author.id).catch(() => null)
            if (member && member.bannable) {
                await member.ban({ reason: "Перевищено ліміт попереджень за нецензурну лексику" })
                await message.channel.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(`${message.author} був забанений за нецензурну лексику.`)
                            .setColor("Red")
                    ]
                })
                logToChannel(client, "", new EmbedBuilder()
                    .setTitle("Бан")
                    .setDescription(`${message.author.tag} забанений за нецензурну лексику`)
                    .setColor("Red")
                )
            }
        }
        return
    }

    // --- Команди ---
    if (!message.content.startsWith(PREFIX)) return
    const args = message.content.slice(PREFIX.length).trim().split(/ +/)
    const command = args.shift()?.toLowerCase()

    if (command === "ping" || command === "status") {
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(t("status", lang))
                    .setColor("Green")
            ]
        })
    }

    if (command === "warns") {
        const user = message.mentions.users.first() || message.author
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(`${t("warns", lang)} ${user}: ${warns[user.id] || 0}`)
                    .setColor("Blue")
            ]
        })
    }

    if (command === "topwarns") {
        const top = Object.entries(warns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
        if (top.length === 0) return message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(t("no_violators", lang))
                    .setColor("Blue")
            ]
        })
        const embed = new EmbedBuilder()
            .setTitle(t("top_violators", lang))
            .setColor("Blue")
        for (const [uid, count] of top) {
            const user = await message.guild.members.fetch(uid).catch(() => null)
            embed.addFields({ name: user?.user.tag || uid, value: `${count}`, inline: false })
        }
        await message.reply({ embeds: [embed] })
    }

    if (command === "ban" && message.author.id === OWNER_ID) {
        const user = message.mentions.users.first()
        if (!user) return message.reply(t("ban_mention", lang))
        const member = await message.guild.members.fetch(user.id).catch(() => null)
        if (member && member.bannable) {
            await member.ban({ reason: "Бан через команду власника" })
            await message.reply(`${user.tag} ${t("banned", lang)}`)
            logToChannel(client, "", new EmbedBuilder()
                .setTitle("Бан через команду")
                .setDescription(`${user.tag} був забанений власником`)
                .setColor("Red")
            )
        } else {
            await message.reply(t("cant_ban", lang))
        }
    }

    if (command === "resetwarns" && message.author.id === OWNER_ID) {
        const user = message.mentions.users.first()
        if (!user) return message.reply(t("reset_mention", lang))
        warns[user.id] = 0
        await message.reply(`${t("reset_done", lang)} ${user.tag} ${t("reset_done2", lang)}`)
    }

    if (command === "unmute" && message.author.id === OWNER_ID) {
        const user = message.mentions.users.first()
        if (!user) return message.reply("Вкажіть користувача для зняття мута.")
        const member = await message.guild.members.fetch(user.id).catch(() => null)
        if (!member) return message.reply("Користувач не знайдений.")
        let muteRole = member.guild.roles.cache.find(r => r.name === MUTE_ROLE_NAME)
        if (muteRole && member.roles.cache.has(muteRole.id)) {
            await member.roles.remove(muteRole)
            if (mutedUsers[member.id]) clearTimeout(mutedUsers[member.id])
            await message.reply(`${user.tag} ${t("unmuted", lang)}`)
        } else {
            await message.reply(t("not_muted", lang))
        }
    }

    if (command === "lang") {
        const newLang = args[0]?.toLowerCase()
        if (newLang === "ua" || newLang === "uk") {
            guildLang[message.guild.id] = newLang
            await message.reply(newLang === "ua" ? t("lang_set_ua", "ua") : t("lang_set_uk", "uk"))
        } else {
            await message.reply("Використовуйте: /lang ua або /lang uk\nUse: /lang ua or /lang uk")
        }
    }

    // --- Нотатки ---
    if (command === "note" && message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const user = message.mentions.users.first()
        const note = args.slice(1).join(" ")
        if (!user || !note) return message.reply("Вкажіть користувача та текст нотатки.")
        if (!userNotes[user.id]) userNotes[user.id] = []
        userNotes[user.id].push(note)
        await message.reply(t("note_added", lang))
    }

    if (command === "notes" && message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const user = message.mentions.users.first()
        if (!user) return message.reply("Вкажіть користувача.")
        const notes = userNotes[user.id] || []
        if (!notes.length) return message.reply(t("no_notes", lang))
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`Notes for ${user.tag}`)
                    .setDescription(notes.map((n, i) => `${i + 1}. ${n}`).join("\n"))
                    .setColor("Purple")
            ]
        })
    }

    if (command === "clear" && message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
        const user = message.mentions.users.first()
        if (!user) return message.reply("Вкажіть користувача.")
        userNotes[user.id] = []
        await message.reply(t("notes_cleared", lang))
    }

    // --- Інформація про користувача ---
    if (command === "userinfo") {
        const user = message.mentions.users.first() || message.author
        const member = await message.guild.members.fetch(user.id).catch(() => null)
        if (!member) return message.reply("Користувач не знайдений.")
        const joined = member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : "?"
        const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.name).join(", ") || "-"
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`${user.tag}`)
                    .setThumbnail(user.displayAvatarURL())
                    .addFields(
                        { name: t("joined", lang), value: joined, inline: true },
                        { name: t("roles", lang), value: roles, inline: true },
                        { name: "ID", value: user.id, inline: false }
                    )
                    .setColor("Blue")
            ]
        })
    }

    if (command === "help") {
        await message.reply({
            embeds: [
                new EmbedBuilder()
                    .setDescription(t("help", lang))
                    .setColor("Blue")
            ]
        })
    }
})

client.login(BOT_TOKEN)
