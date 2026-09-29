# FoxCraft Discord botu

FoxCraft — Azərbaycan Minecraft serveri.
Dostlarınla oyna, yeni insanlarla tanış ol, əylən və öz macəranı qur!

Layihə Discord.js v14 gateway botunu imzalanmış Express interactions endpoint-i ilə birlikdə işlədir. Gateway `!` prefix əmrləri, botun presence-i və server idarəetmə əməliyyatları üçün; webhook isə slash əmrlərinə cavab üçün istifadə olunur.

## Əmrlər

| Slash | Prefix | Təyinat |
|---|---|---|
| `/foxcraft-info` | `!foxcraft-info` | Server məlumatları və üzv sayı |
| `/ip` | `!ip` | `.env`-dəki IP və versiya |
| `/rules` | `!rules` | FoxCraft qaydaları |
| `/server` | `!server` | Minecraft server statusu |
| `/status` | `!status` | Canlı server statusu və oyunçu sayı |
| `/link` | `!link` | Minecraft hesabını Discord hesabına bağlayır |
| `/whoami` | `!whoami` | Bağlı Minecraft istifadəçi adını göstərir |
| `/ping` | `!ping` | Bot və Discord gecikməsi |
| `/foxcraft` | — | Server sahibi/admin üçün rebrand |
| `/avatar` | `!avatar` | Üzvün/fənin avatarını göstərir |
| `/userinfo` | `!userinfo` | Üzv haqqında ətraflı məlumat |
| `/serverinfo` | `!serverinfo` | Server haqqında ətraflı məlumat |
| `/qrkod` | `!qrkod` | Mətndən QR kod yaradır |
| `/afk` | `!afk` | AFK (uzaqda) vəziyyətini aktivləşdirir |
| `/ban` | `!ban` | Üzvü ban edir (mod-loqa yazır) |
| `/kick` | `!kick` | Üzvü serverdən atır (mod-loqa yazır) |
| `/mute` | `!mute` | Üzvü susdurur (müddət formatı: `1d`, `2h30m`) |
| `/unmute` | `!unmute` | Susmanı ləğv edir |
| `/unban` | `!unban` | Banı qaldırır |
| `/sil` (`/clear`) | `!sil`, `!clear`, `!purge` | Mesajları kütləvi silir (mod-loqa yazır) |
| `/lock` | `!lock` | Kanalı kilidləyir |
| `/unlock` | `!unlock` | Kanal kilidini açır |
| `/slowmode` | `!slowmode` | Kanalda yavaş rejim təyin edir |
| `/warn` | `!warn` | Üzvü xəbərdar edir; 3 xəbərdarlıqdan sonra avtomatik susdurma |
| `/warnings` | `!warnings` | Üzvün xəbərdarlıqlarını göstərir |
| `/removewarn` | `!removewarn` | Bir xəbərdarlığı (və ya hamısını) silir |
| `/timeout` | `!timeout` | Üzvü müvəqqəti susdurur (maksimum 28 gün) |
| `/untimeout` | `!untimeout` | Timeout-u ləğv edir |
| `/softban` | `!softban` | Kick + ban + unban (avatar/ləqəb yenilənir); `--keep` banı saxlayır |
| `/move` | `!move` | Üzvü başqa səs kanalına məcbur köçürür |
| `/ticket-setup` | — | Ticket sistemi panelini qurur |
| `/setlog` | `!setlog` | Mod-loq kanalını təyin edir |
| `/logstatus` | `!logstatus` | Mod-loq kanalının vəziyyəti |
| `/help` | `!help` | Kateqoriyalı yardım menyusu |
| `/restart` | — | Botu yenidən başladır (yalnız sahib) |
| `/panel` | `!panel`, `!dashboard` | Modulların idarəetmə paneli (yalnız sahib) |
| `/play` | `!play` | YouTube mahnısı səs kanalında oxunur (`!play <ad və ya link>`) |
| `/join` | `!join` | Səs kanalına qoşulur (oxutmadan) |
| `/skip` | `!skip` | Cari mahnını keçir |
| `/stop` | `!stop`, `!leave` | Oxutmanı dayandırır, növbəni təmizləyir, kanaldan çıxır |
| `/queue` | `!queue` | Növbəni göstərir |
| `/nowplaying` | `!nowplaying` | Cari mahnını göstərir |
| `/volume` | `!volume` | Səs səviyyəsini dəyişir (0-100) |
| `/loop` | `!loop` | Təkrarlama rejimi: `off`, `track`, `queue` |
| `/replay` | `!replay` | Cari mahnını yenidən başlatır |
| `/automod` | `!automod` | Automod statusu + parametrlər |
| `/sunucukur` | `!sunucukur` | Tam server qurulumu |
| `/sayma` | `!sayma` | Sayma (rəqəm) sistemi kanalını qurur |
| `/cekilis` | `!cekilis` | Çəkiliş başlat (`baslat`) / yenidən seç (`yeniden`) |
| `/welcomer` | `!welcomer` | Xoş gəldin/çıxış sistemi kanalını qurur |
| `/qeydiyyat` | `!qeydiyyat` | Qeydiyyat panelini quraşdırır |

Prefix sütununda göstərilən bütün əmrlər həm slash, həm də `!` prefix formasında işləyir.

## Panellər və sistemlər

- **`/panel`** — modulları (Automod, Welcomer, Sayma, Çəkiliş, Ticket, Qeydiyyat, AFK, Mod-loq) SQLite bazasında saxlanan ayarlarla aktivləşdirir/söndürür, ayar modalarını açır. Yalnız `.env`-dəki `OWNER_ID` sahibi istifadə edə bilər.
- **Automod** — link, dəvət, böyük hərf, spam/flood süzgəcləri, qadağan sözlər, istisna rollar/kanallar; hərəkət `delete`, `warn` və ya `timeout`.
- **Welcomer** — `{user} {username} {server} {membercount}` yerləri, avto-rol, DM xoş gəldin mesajı, çıxış mesajı.
- **Sayma** — təyin olunmuş kanalda ardıcıl sayma; səhv və ya təkrarlanan mesaj silinir.
- **Çəkiliş** — `!cekilis baslat <mükafat> <müddət>` ilə işə düşür, düyməyə basanlar qatra bilir, vaxt bitəndə qaliblər seçilir; `/panel` vasitəsilə söndürülə bilər.
- **Qeydiyyat** — serverə qeydiyyat paneli; düyməyə basan üzv seçilmiş rol alır.
- **Dəyişiklik/müddət formatları** — müddətlər `1d`, `2h30m`, `45m` kimi birləşmələrdən ibarətdir (maksimum 28 gün).

`/foxcraft` kanallara və kateqoriyalara toxunmur. Server adını, mövcud logo mənbəyi varsa ikonu, bot ləqəbini, bot avatarını, presence-i və təhlükəsiz role adlarını yeniləyir. Əməliyyat xətaları yekun cavabda ayrıca göstərilir. `FOXCRAFT_DRY_RUN=true` dəyişiklikləri sınaq məqsədilə göstərir.

## Dashboard

`BOT_API_TOKEN` ilə qorunan `/dashboard` səhifəsi botun görə bildiyi serverləri və kanalları sadalayır; seçilmiş kanala elan (mətn) və ya embed göndərə bilərsiniz.

- Tokeni `.env`-də `BOT_API_TOKEN=` olaraq təyin edin (ixtiyari dəyər).
- `http://localhost:PORT/dashboard` səhifəsini açın, tokeni daxil edin.
- Serveri və kanalı seçin, tipi seçin (elan/embed), mətni yazın və "Göndər"ə basın.

API (Bearer `BOT_API_TOKEN` ilə):
- `GET /api/guilds` — serverlər və onların mətn kanalları.
- `POST /api/guilds/:guildId/messages` — `{ type: "announce"|"embed", channelId, content|title|description|color|fields }`.

## Səs musiqisi (YouTube)

`/play` YouTube-dan audio çəkir. Bunun üçün **host-da FFmpeg binarysi olmalıdır** — musiqi `@distube/ytdl-core` vasitəsilə FFmpeg-lə transkodlanır. Opus kodlayıcısı `npm install` zamanı `scripts/ensure-opus.js` ilə qurulur, FFmpeg isə sistem paketidir:

```bash
# Debian/Ubuntu
apt-get install -y ffmpeg
# Alpine
apk add ffmpeg
# macOS
brew install ffmpeg
```

`/play` botu səsləndiricinin qoşulduğu səs kanalına qoşulur, ona görə də əvvəlcə kanala qoşulun. Spotify oxunmur — Spotify API artıq audio axını vermir; yalnız YouTube dəstəklənir.

Növbə 100 mahnı ilə məhduddur, boş 5 dəqiqə sonra bot avtomatik kanaldan çıxır. Səs kanalında həm də `Connect` və `Speak` icazəsi lazımdır.

## Quraşdırma və işə salma

Mövcud `.env` faylını saxlayın. Yeni açarlar:

```env
GUILD_ID=
FOXCRAFT_SERVER_IP=
FOXCRAFT_VERSION=
FOXCRAFT_LOGO_URL=
FOXCRAFT_LOGO_PATH=assets/foxcraft-logo.png
OWNER_ID=
FOXCRAFT_DRY_RUN=false
FOXCRAFT_STATUS_CHANNEL_ID=
FOXCRAFT_WHITELIST_CHANNEL_ID=
BOT_API_TOKEN=
```

IP və versiya boşdursa bot `Yaxında` göstərir. Logo üçün əvvəl `FOXCRAFT_LOGO_URL`, sonra `FOXCRAFT_LOGO_PATH` yoxlanılır; layihədə hazırda uyğun logo faylı yoxdur.

`FOXCRAFT_STATUS_CHANNEL_ID` verilərsə bot hər 5 dəqiqədən bir yalnız həmin kanalın adını canlı server statusu ilə yeniləyir. Dəyər boşdursa bu funksiya deaktivdir. Whitelist rejimi təsdiqlənmədiyi üçün `/whitelist` və `!whitelist` hazırda əlavə edilməyib; `FOXCRAFT_WHITELIST_CHANNEL_ID` gələcək staff sorğuları üçün boş saxlanılıb.

Slash əmrlərini qeydiyyata almaq və köhnələri silmək üçün:

```bash
npm run deploy
```

Bu deploy `Routes.applicationCommands(CLIENT_ID)` üzərinə tam yeni siyahını yazır; Discord-da qalan köhnə qlobal slash əmrləri belə silinir. Botu `applications.commands` və `bot` scope-ları, `Guilds`, `Guild Messages`, `Message Content`, `Guild Members` intentləri ilə serverə dəvət edin.

İşə salma əmri dəyişməyib:

```bash
npm start
```

Botun rebrand üçün `Manage Guild`, `Manage Roles` və bot ləqəbi üçün uyğun nickname icazəsi olmalıdır. `PUBLIC_KEY` interactions endpoint-in doğrulanması üçün, `DISCORD_TOKEN` isə gateway və Discord API əməliyyatları üçün istifadə olunur.
