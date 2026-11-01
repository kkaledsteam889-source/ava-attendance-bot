const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('AVA Attendance Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// 🔴 آدي روم تأكيد الحضور (تأكد إنه صحيح 100%)
const NOTIFICATION_CHANNEL_ID = '1488215355364085770';

console.log("🔍 فحص الاتصال: Supabase URL =", process.env.SUPABASE_URL ? "موجود ✅" : "مفقود ❌");

// 1. الاتصال بقاعدة بيانات Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. إعدادات البوت والصلاحيات الشاملة
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`✅ بوت الأزرار الاحترافي شغال باسم: ${client.user.tag}`);

    // تسجيل أمر التصفير (Slash Command) تلقائياً عند تشغيل البوت
    const commands = [
        new SlashCommandBuilder()
            .setName('reset_attendance')
            .setDescription('إعادة تعيين وتصفير جميع سجلات الحضور لبدء أسبوع جديد')
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 جاري تسجيل أوامر البوت (Slash Commands)...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('✅ تم تسجيل الأوامر بنجاح!');
    } catch (error) {
        console.error('❌ خطأ أثناء تسجيل الأوامر:', error);
    }
});

// 3. أمر إرسال لوحة الحضور بالأزرار أو استقبال الأوامر
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.content === '!لوحة_الحضور') {
        const embed = new EmbedBuilder()
            .setTitle('📋 ╎ لوحة الحضور')
            .setDescription('اضغط على الأزرار أدناه لتسجيل الحضور أو المغادرة:\n\n' +
                '🕒 **تسجيل الحضور**\nابدا تسجيل وقت حضورك\n\n' +
                '⏳ **تسجيل المغادرة**\nأوقف تسجيل وقت حضورك (إن كانت نشطة)\n\n' +
                '📊 **عرض ساعاتي**\nعرض ملخص ساعاتي اليوم، ومدة جلستك الحالية\n\n' +
                '💤 **استراحة (AFK)**\nابدأ أو أنه استراحتك أثناء جلسة الحضور')
            .setColor('#2b2d31');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('check_in')
                .setLabel('تسجيل الحضور')
                .setEmoji('🟢')
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId('check_out')
                .setLabel('تسجيل المغادرة')
                .setEmoji('🔴')
                .setStyle(ButtonStyle.Danger),

            new ButtonBuilder()
                .setCustomId('my_hours')
                .setLabel('عرض ساعاتي')
                .setEmoji('🕒')
                .setStyle(ButtonStyle.Secondary),

            new ButtonBuilder()
                .setCustomId('afk_mode')
                .setLabel('استراحة (AFK)')
                .setEmoji('💤')
                .setStyle(ButtonStyle.Secondary)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
});

// 4. نظام التعامل مع التفاعلات (الأزرار وأوامر السلاش)
client.on('interactionCreate', async (interaction) => {
    // --- معالجة أوامر السلاش (Slash Commands مثل /reset_attendance) ---
    if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'reset_attendance') {
            await interaction.deferReply({ ephemeral: true });

            try {
                // تصفير أو حذف سجلات الحضور الأسبوعية من Supabase
                // نقوم بحذف السجلات القديمة أو تحديثها ليتم تصفير الساعات
                const { error } = await supabase
                    .from('attendance_sessions')
                    .delete()
                    .neq('id', 0); // يحذف كافة السجلات الحالية لتصفير الأسبوع

                if (error) {
                    console.error('Reset Error:', error.message);
                    return interaction.editReply({ content: `❌ عذراً، حدث خطأ أثناء تصفير الحضور: ${error.message}` });
                }

                const successEmbed = new EmbedBuilder()
                    .setColor('#57F287')
                    .setTitle('🔄 ╎ تم تصفير الحضور بنجاح')
                    .setDescription('تم مسح وإعادة تعيين كافة سجلات الحضور والساعات للأسبوع الحالي. أصبح بإمكان الجميع بدء أسبوع جديد من الصفر!');

                await interaction.editReply({ embeds: [successEmbed] });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: '❌ حدث خطأ غير متوقع أثناء عملية التصفير.' });
            }
            return;
        }
    }

    // --- معالجة الأزرار (Buttons) ---
    if (!interaction.isButton()) return;

    const userId = interaction.user.id;
    const username = interaction.user.username;
    const timeNow = new Date();
    const timeFormatted = timeNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // --- زر تسجيل الحضور 🟢 ---
    if (interaction.customId === 'check_in') {
        try {
            await interaction.deferReply({ ephemeral: true });

            const { data: existingSession } = await supabase
                .from('attendance_sessions')
                .select('*')
                .eq('admin_discord_id', userId)
                .eq('is_active', true)
                .maybeSingle();

            if (existingSession) {
                return interaction.editReply({ content: '⚠️ لديك جلسة حضور نشطة مسبقاً! يجب عليك تسجيل المغادرة أولاً.' });
            }

            const { error } = await supabase
                .from('attendance_sessions')
                .insert([
                    {
                        session_id: `session_${Date.now()}_${userId}`,
                        admin_discord_id: userId,
                        admin_name: username,
                        is_active: true
                    }
                ]);

            if (error) {
                console.error('Supabase Error:', error.message);
                return interaction.editReply({ content: `❌ عذراً، خطأ في قاعدة البيانات: ${error.message}` });
            }

            try {
                const notifyChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                if (notifyChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#57F287')
                        .setAuthor({ name: username, iconURL: interaction.user.displayAvatarURL() })
                        .setTitle('🟢 ╎ تسجيل حضور جديد')
                        .setDescription(`المستخدم <@${userId}> قام بتسجيل **الحضور** في تمام الساعة **${timeFormatted}**`);
                    
                    await notifyChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error("❌ خطأ خطير أثناء إرسال الإشعار للروم:", err);
            }

            const embed = new EmbedBuilder()
                .setColor('#57F287')
                .setAuthor({ name: username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle('🟢 ╎ سجل الحضور')
                .setDescription(`لقد سجل الحضور عند **${timeFormatted}**`);

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ حدث خطأ غير متوقع.' });
        }
    }

    // --- زر تسجيل المغادرة 🔴 ---
    else if (interaction.customId === 'check_out') {
        try {
            await interaction.deferReply({ ephemeral: true });

            const { data: activeSessions, error: fetchError } = await supabase
                .from('attendance_sessions')
                .select('*')
                .eq('admin_discord_id', userId)
                .eq('is_active', true);

            if (fetchError || !activeSessions || activeSessions.length === 0) {
                return interaction.editReply({ content: '⚠️ ليس لديك أي جلسة حضور نشطة حالياً لتسجيل مغادرتها!' });
            }

            const activeSession = activeSessions[0];
            const checkInTime = new Date(activeSession.created_at);
            const diffMs = timeNow - checkInTime;
            const diffMins = Math.floor(diffMs / 60000);
            const hours = Math.floor(diffMins / 60);
            const mins = diffMins % 60;
            const durationFormatted = `${hours}h ${mins}m`;

            // حساب الساعات الرقمية لتخزينها بدقة لتسهيل قراءتها في الموقع وإكسل
            const durationHours = diffMs / (1000 * 60 * 60);

            const { error: updateError } = await supabase
                .from('attendance_sessions')
                .update({ 
                    is_active: false,
                    duration_hours: durationHours 
                })
                .eq('id', activeSession.id);

            if (updateError) {
                console.error('Update Error:', updateError.message);
                return interaction.editReply({ content: `❌ حدث خطأ أثناء تحديث المغادرة: ${updateError.message}` });
            }

            try {
                const notifyChannel = await client.channels.fetch(NOTIFICATION_CHANNEL_ID);
                if (notifyChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#ED4245')
                        .setAuthor({ name: username, iconURL: interaction.user.displayAvatarURL() })
                        .setTitle('🟠 ╎ تسجيل مغادرة')
                        .setDescription(`المستخدم <@${userId}> أنهى جلسته وسجل **المغادرة**`)
                        .addFields(
                            { name: '🟢 وقت الحضور', value: checkInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), inline: true },
                            { name: '🔴 وقت المغادرة', value: timeFormatted, inline: true },
                            { name: '⏳ المدة الكلية', value: durationFormatted, inline: false }
                        );
                    
                    await notifyChannel.send({ embeds: [logEmbed] });
                }
            } catch (err) {
                console.error("❌ خطأ أثناء إرسال إشعار المغادرة للروم:", err);
            }

            const embed = new EmbedBuilder()
                .setColor('#ED4245')
                .setAuthor({ name: username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle('🟠 ╎ سجل المغادرة')
                .setDescription(`لقد سجل المغادرة بعد **${durationFormatted}**`)
                .addFields(
                    { name: '🟢 وقت الحضور', value: checkInTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }), inline: true },
                    { name: '🔴 وقت المغادرة', value: timeFormatted, inline: true },
                    { name: '⏳ المدة الكلية', value: durationFormatted, inline: false }
                );

            await interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ حدث خطأ أثناء تسجيل المغادرة.' });
        }
    }

    // --- زر عرض ساعاتي 🕒 ---
    else if (interaction.customId === 'my_hours') {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: `🕒 أهلاً **${username}**، جاري جلب ملخص ساعاتك...` });
    }

    // --- زر الاستراحة 💤 ---
    else if (interaction.customId === 'afk_mode') {
        await interaction.deferReply({ ephemeral: true });
        await interaction.editReply({ content: `💤 تم تسجيل وضع الاستراحة (AFK) بنجاح.` });
    }
});
// ====== الأونرية: كل من معه صلاحية Administrator في الديسكورد يُسجَّل تلقائياً في جدول owners ======
// الصق هذا الكود في index.js (البوت) فوق آخر سطر: client.login(process.env.DISCORD_TOKEN);

async function syncOwners() {
    try {
        const rows = [];

        for (const guild of client.guilds.cache.values()) {
            const members = await guild.members.fetch();
            members.forEach(m => {
                // الصلاحية تُحسب من كل رتب العضو (وصاحب السيرفر يُحسب إداري دائماً)
                if (!m.user.bot && m.permissions.has(PermissionFlagsBits.Administrator)) {
                    rows.push({ discord_id: m.id, name: m.user.username });
                }
            });
        }

        // الجدول يطابق الصلاحية تماماً: نضيف الجدد، ونحذف من انسحبت منهم الصلاحية
        const { data: current, error: readError } = await supabase.from('owners').select('discord_id');
        if (readError) throw readError;

        const ids = rows.map(r => r.discord_id);
        const toRemove = (current || []).map(o => o.discord_id).filter(id => !ids.includes(id));

        if (rows.length) {
            const { error } = await supabase.from('owners').upsert(rows, { onConflict: 'discord_id' });
            if (error) throw error;
        }
        if (toRemove.length) {
            const { error } = await supabase.from('owners').delete().in('discord_id', toRemove);
            if (error) throw error;
        }
        console.log(`✅ الأونرية: ${rows.length} مسجل، ${toRemove.length} أُزيل`);
    } catch (err) {
        console.error('❌ خطأ في مزامنة الأونرية:', err.message || err);
    }
}

client.once('ready', () => {
    syncOwners();
    setInterval(syncOwners, 5 * 60 * 1000); // كل 5 دقايق
});
// ====== إشعار تعديل الوقت من الموقع ======
// الصق هذا الكود في index.js (البوت) فوق آخر سطر: client.login(process.env.DISCORD_TOKEN);

// الروم اللي يرسل فيه إشعار التعديل. الحين نفس روم تأكيد الحضور،
// غيّر الرقم بين علامتي التنصيص لو تبي روم ثاني، مثال: '1234567890123456789'
const ADJUST_CHANNEL_ID = NOTIFICATION_CHANNEL_ID;

const fmtMin = (mins) => {
    const sign = mins < 0 ? '-' : '';
    const m = Math.abs(Math.round(mins));
    return `${sign}${Math.floor(m / 60)}h ${m % 60}m`;
};

// مجموع وقت العضو قبل هذا التعديل (جلساته + التعديلات السابقة)
async function memberTotalMinutes(memberId, beforeAdjId) {
    const { data: sessions, error: e1 } = await supabase
        .from('attendance_sessions')
        .select('duration_hours, is_active, created_at')
        .eq('admin_discord_id', memberId);
    if (e1) throw e1;

    const sessionMins = (sessions || []).reduce((sum, s) => {
        const hours = s.duration_hours != null
            ? Number(s.duration_hours)
            : (s.is_active ? (Date.now() - new Date(s.created_at)) / 3600000 : 0);
        return sum + hours * 60;
    }, 0);

    const { data: adjs, error: e2 } = await supabase
        .from('time_adjustments')
        .select('minutes')
        .eq('member_discord_id', memberId)
        .lt('id', beforeAdjId);
    if (e2) throw e2;

    const adjMins = (adjs || []).reduce((sum, a) => sum + a.minutes, 0);
    return sessionMins + adjMins;
}

let adjustBusy = false;
async function notifyAdjustments() {
    if (adjustBusy) return;
    adjustBusy = true;
    try {
        const { data: pending, error } = await supabase
            .from('time_adjustments')
            .select('*')
            .eq('notified', false)
            .order('id', { ascending: true })
            .limit(10);
        if (error) throw error;

        for (const adj of pending || []) {
            // نحجز الإشعار أولاً عشان ما يتكرر
            const { data: claimed, error: claimError } = await supabase
                .from('time_adjustments')
                .update({ notified: true })
                .eq('id', adj.id)
                .eq('notified', false)
                .select('id');
            if (claimError || !claimed || claimed.length === 0) continue;

            try {
                const before = await memberTotalMinutes(adj.member_discord_id, adj.id);
                const after = before + adj.minutes;
                const isAdd = adj.minutes >= 0;
                const channel = await client.channels.fetch(ADJUST_CHANNEL_ID);

                const embed = new EmbedBuilder()
                    .setColor(isAdd ? '#57F287' : '#ED4245')
                    .setTitle(isAdd ? '🟢 ╎ إضافة وقت' : '🔴 ╎ خصم وقت')
                    .setDescription(`الأونر <@${adj.edited_by}> ${isAdd ? 'أضاف وقتاً إلى' : 'خصم وقتاً من'} <@${adj.member_discord_id}>`)
                    .addFields(
                        { name: '⏳ مدة التعديل', value: `${isAdd ? '+' : '-'}${fmtMin(Math.abs(adj.minutes))}`, inline: true },
                        { name: '📊 قبل التعديل', value: fmtMin(before), inline: true },
                        { name: '📈 بعد التعديل', value: fmtMin(after), inline: true },
                        { name: '📝 السبب', value: String(adj.reason || 'بدون سبب').slice(0, 1000) }
                    )
                    .setTimestamp(new Date(adj.created_at));

                await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
            } catch (err) {
                console.error('❌ فشل إرسال إشعار التعديل، راح أعيد المحاولة:', err.message || err);
                await supabase.from('time_adjustments').update({ notified: false }).eq('id', adj.id);
            }
        }
    } catch (err) {
        console.error('❌ خطأ في فحص التعديلات:', err.message || err);
    } finally {
        adjustBusy = false;
    }
}

client.once('ready', () => {
    notifyAdjustments();
    setInterval(notifyAdjustments, 10 * 1000); // كل 10 ثواني
});
client.login(process.env.DISCORD_TOKEN);
