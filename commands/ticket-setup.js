const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
const { envValue, foxcraftEmbed } = require('../utils/foxcraft');

const { t } = require('../utils/lang');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Sets up the ticket system panel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        // In HTTP Webhook mode, we return the response object instead of calling .reply()
        const embed = {
            title: '🎫 FoxCraft Dəstək Sistemi',
            description: '✨ **FoxCraft Peşəkar Dəstək Mərkəzi**\n\nSizə kömək etmək üçün buradayıq! Probleminizi həll etmək üçün aşağıdakı düyməyə basaraq ticket yaradın.\n\n🛡️ **Qaydalar:**\n- Spam etməyin\n- Staff komandasına hörmətlə yanaşın\n- Probleminizi ətraflı izah edin',
            color: 0x2f3136,
            image: { url: 'https://cdn.discordapp.com/attachments/1550137723669577738/1551307336562507916/285C95BA-C2C7-4E3E-9E21-FB650DAAD4AF.jpg?ex=6ab17f0a&is=6ab02d8a&hm=9961e284df51bee1ca6a2aa824f5dffc5484071d028c43f11ca81f43a34de945&' },
            footer: {
                text: 'FoxCraft | Azərbaycan Minecraft icması',
            }
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('foxcraft:ticket-create')
                .setLabel('Ticket Yarat')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        return {
            type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
            data: {
                embeds: [embed],
                components: [row.toJSON()],
            }
        };
    },

    prefixExecute: async (message) => {
        const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                        (envValue('OWNER_ID') && envValue('OWNER_ID') === message.author.id);

        if (!isAdmin) return message.reply(t(message.guild?.id, 'perm_admin_only'));

        const embed = {
            title: '🎫 FoxCraft Dəstək Sistemi',
            description: '✨ **FoxCraft Peşəkar Dəstək Mərkəzi**\n\nSizə kömək etmək üçün buradayıq! Probleminizi həll etmək üçün aşağıdakı düyməyə basaraq ticket yaradın.\n\n🛡️ **Qaydalar:**\n- Spam etməyin\n- Staff komandasına hörmətlə yanaşın\n- Probleminizi ətraflı izah edin',
            color: 0x2f3136,
            image: { url: 'https://cdn.discordapp.com/attachments/1550137723669577738/1551307336562507916/285C95BA-C2C7-4E3E-9E21-FB650DAAD4AF.jpg?ex=6ab17f0a&is=6ab02d8a&hm=9961e284df51bee1ca6a2aa824f5dffc5484071d028c43f11ca81f43a34de945&' },
            footer: {
                text: 'FoxCraft | Azərbaycan Minecraft icması',
            }
        };

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('foxcraft:ticket-create')
                .setLabel('Ticket Yarat')
                .setEmoji('🎫')
                .setStyle(ButtonStyle.Primary)
        );

        await message.channel.send({
            embeds: [embed],
            components: [row]
        });

        return message.channel.send('Dəstək paneli uğurla quruldu!');
    },
};
