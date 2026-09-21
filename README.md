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

`/foxcraft` kanallara və kateqoriyalara toxunmur. Server adını, mövcud logo mənbəyi varsa ikonu, bot ləqəbini, bot avatarını, presence-i və təhlükəsiz role adlarını yeniləyir. Əməliyyat xətaları yekun cavabda ayrıca göstərilir. `FOXCRAFT_DRY_RUN=true` dəyişiklikləri sınaq məqsədilə göstərir.

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
