const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
require('./keepalive.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages],
  partials: [Partials.Channel]
});

const prefix = 'cv';
const currency = '💎';
const dataFile = './data.json';

let data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function getUser(id) {
  if (!data.users[id]) {
    data.users[id] = {
      wallet: 0,
      bank: 0
    };
  }
  return data.users[id];
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const userId = message.author.id;
  const user = getUser(userId);
  const now = Date.now();

  if (!data.cooldowns.daily) data.cooldowns.daily = {};
  if (!data.cooldowns.daily[userId]) data.cooldowns.daily[userId] = 0;

  // === 3. Daily Command ===
  if (command === 'daily') {
    const cooldown = 6 * 60 * 60 * 1000; // 6 hours
    if (now - data.cooldowns.daily[userId] < cooldown) {
      const remaining = cooldown - (now - data.cooldowns.daily[userId]);
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      return message.reply(`⏳ Wait ${hours}h ${minutes}m ${seconds}s before claiming daily again.`);
    }

    user.wallet += 200;
    data.cooldowns.daily[userId] = now;
    saveData();

    const embed = new EmbedBuilder()
      .setTitle('💰 Daily Reward')
      .setDescription(`You received **200 ${currency}**!`)
      .setColor('Green');

    try {
      await message.author.send({ embeds: [embed] });
      if (message.channel.type !== 1) message.react('📩');
    } catch {
      message.reply({ embeds: [embed] });
    }
  }
});

client.login('put-your-bot-token-here');

if (command === 'gems') {
  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Balance`)
    .setDescription(`💼 Wallet: **${user.wallet} ${currency}**\n🏦 Bank: **${user.bank} ${currency}**`)
    .setColor('Blue');
  message.reply({ embeds: [embed] });
}
if (command === 'gamble' && !args[0]) {
  if (user.wallet < 50) return message.reply(`❌ You need at least 50 ${currency} to gamble!`);

  const patterns = [
    ['lose', 'lose', 'win', 'lose', 'win'],
    ['win', 'lose', 'win', 'lose', 'lose'],
    ['lose', 'win', 'lose', 'win', 'lose'],
    ['win', 'win', 'lose', 'lose', 'lose'],
    ['lose', 'lose', 'lose', 'win', 'win'],
    ['win', 'lose', 'lose', 'win', 'win'],
    ['lose', 'win', 'win', 'lose', 'lose'],
    ['win', 'win', 'win', 'lose', 'lose'],
    ['lose', 'lose', 'win', 'win', 'win'],
    ['win', 'lose', 'win', 'win', 'lose'],
  ];

  const pattern = patterns[Math.floor((Date.now() / 30000) % patterns.length)];
  const result = pattern[Math.floor(Math.random() * pattern.length)];

  const amount = 50;

  if (result === 'win') {
    user.wallet += amount;
    message.reply(`🎉 You **won** ${amount} ${currency}!`);
  } else {
    user.wallet -= amount;
    message.reply(`😢 You **lost** ${amount} ${currency}...`);
  }

  saveData();
}

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

if (command === 'give') {
  const target = message.mentions.users.first();
  const amount = parseInt(args[1]);

  if (!target || isNaN(amount) || amount <= 0) {
    return message.reply(`❌ Usage: \`cv give @user amount\``);
  }

  if (target.id === message.author.id) return message.reply("❌ You can't give gems to yourself.");
  if (user.wallet < amount) return message.reply(`❌ You don't have enough ${currency}!`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('accept_give').setLabel('✅ Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('deny_give').setLabel('❌ Deny').setStyle(ButtonStyle.Danger)
  );

  const embed = new EmbedBuilder()
    .setTitle('Incoming Transfer')
    .setDescription(`${message.author} wants to give you **${amount} ${currency}**.\nDo you accept?`)
    .setColor('Yellow');

  const msg = await message.channel.send({ content: `<@${target.id}>`, embeds: [embed], components: [row] });

  const filter = (i) => i.user.id === target.id;
  const collector = msg.createMessageComponentCollector({ filter, time: 15000, max: 1 });

  collector.on('collect', (i) => {
    if (i.customId === 'accept_give') {
      if (user.wallet < amount) {
        i.reply({ content: '❌ Sender no longer has enough gems.', ephemeral: true });
      } else {
        user.wallet -= amount;
        const receiver = getUser(target.id);
        receiver.wallet += amount;
        saveData();
        i.reply(`✅ Transfer complete. ${target} received ${amount} ${currency} from ${message.author}.`);
      }
    } else {
      i.reply(`❌ Transfer denied.`);
    }
  });

  collector.on('end', (collected) => {
    if (collected.size === 0) msg.edit({ content: '⏳ Time expired.', components: [] });
    else msg.edit({ components: [] });
  });
}

if (command === 'bank') {
  const embed = new EmbedBuilder()
    .setTitle(`${message.author.username}'s Bank`)
    .setDescription(`🏦 Bank Balance: **${user.bank} ${currency}**`)
    .setColor('Green');
  message.reply({ embeds: [embed] });
}

if (['deposit', 'dep'].includes(command)) {
  const amount = parseInt(args[0]);
  if (isNaN(amount) || amount <= 0) return message.reply('❌ Enter a valid amount to deposit.');

  if (user.wallet < amount) return message.reply('❌ You don’t have enough gems in wallet.');
  user.wallet -= amount;
  user.bank += amount;
  saveData();
  message.reply(`✅ You deposited **${amount} ${currency}** into your bank.`);
}
if (command === 'steal') {
  const target = message.mentions.users.first();
  if (!target || target.id === message.author.id) return message.reply('❌ Mention a valid user to steal from.');

  const targetUser = getUser(target.id);
  const patterns = [
    ['fail', 'success', 'fail', 'fail', 'success'],
    ['fail', 'fail', 'success', 'fail', 'success'],
    ['success', 'fail', 'fail', 'fail', 'success'],
    ['fail', 'success', 'fail', 'success', 'fail'],
    ['fail', 'fail', 'fail', 'success', 'success'],
  ];

  const pattern = patterns[Math.floor((Date.now() / 50000) % patterns.length)];
  const outcome = pattern[Math.floor(Math.random() * pattern.length)];

  if (targetUser.wallet <= 0) return message.reply('❌ Target has nothing in wallet to steal.');

  if (outcome === 'success') {
    let stolen = Math.floor(Math.random() * targetUser.wallet) + 1;
    const bonusChance = Math.random() < 0.2;
    if (bonusChance) stolen *= 2;

    targetUser.wallet -= stolen;
    user.wallet += stolen;
    saveData();

    message.reply(`🎉 You successfully stole **${stolen} ${currency}** from ${target}!${bonusChance ? ' 🔥 Bonus success!' : ''}`);
  } else {
    const penalty = Math.min(user.bank, Math.floor(user.bank * Math.random()));
    user.bank -= penalty;
    
    if (['withdraw', 'with'].includes(command)) {
  const amount = parseInt(args[0]);
  if (isNaN(amount) || amount <= 0) return message.reply('❌ Enter a valid amount to withdraw.');

  if (user.bank < amount) return message.reply('❌ You don’t have enough gems in bank.');
  user.bank -= amount;
  user.wallet += amount;
  saveData();
  message.reply(`✅ You withdrew **${amount} ${currency}** from your bank.`);
}if (command === 'clover' && args[0] === 'ap' && args[1] === 'use') {
  if (message.author.id !== '715443115842076713') return;

  const target = message.mentions.users.first();
  const amount = parseInt(args[3]);

  if (!target || isNaN(amount) || amount <= 0) return message.reply('❌ Invalid syntax or amount.');

  const targetUser = getUser(target.id);
  targetUser.wallet += amount;
  saveData();

  message.reply(`🌟 Successfully gave **${amount} ${currency}** to ${target.tag}`);
}
if (command === 'gamble' && message.mentions.users.size > 0) {
  const opponent = message.mentions.users.first();
  if (opponent.bot || opponent.id === message.author.id) return message.reply('❌ Invalid opponent.');

  const user2 = getUser(opponent.id);
  const minGems = Math.min(user.wallet, user2.wallet);
  if (minGems <= 0) return message.reply('❌ One of you does not have enough gems.');

  const amount = Math.floor(minGems / 2) || 1;
  const winner = Math.random() < 0.5 ? message.author : opponent;
  const loser = winner.id === message.author.id ? opponent : message.author;

  const winnerUser = getUser(winner.id);
  const loserUser = getUser(loser.id);

  winnerUser.wallet += amount;
  loserUser.wallet -= amount;
  saveData();

  message.channel.send(`🎲 **${message.author.username}** vs **${opponent.username}**\n💥 Winner: **${winner.username}**\n💰 Amount: **${amount} ${currency}**`);
}