'use client';

import React, { use, useEffect, useState } from 'react';
import {
  fetchConfig, saveConfig, saveFullConfig, fetchChannels, fetchRoles,
  fetchMembersData, sendToolMessage,
} from '@/lib/api';
import {
  Section,
  Toggle,
  NumberInput,
  TextInput,
  ChannelSelect,
  RoleSelect,
} from '@/components/FormComponents';

export default function ConfigSectionPage({ params }) {
  const { guildId, section } = use(params);
  const lowercaseSection = section.toLowerCase();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const [config, setConfig] = useState(null);
  const [channels, setChannels] = useState([]);
  const [roles, setRoles] = useState([]);
  const [membersData, setMembersData] = useState({ members: [], invites: [], infractions: [] });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberPage, setMemberPage] = useState(0);
  const [rawText, setRawText] = useState('');
  const [embedForm, setEmbedForm] = useState({ title: '', description: '', color: '#5865F2', fields: '', channelId: '' });
  const [announceForm, setAnnounceForm] = useState({ content: '', channelId: '', mentionEveryone: false });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        const [configData, channelData, roleData] = await Promise.all([
          fetchConfig(guildId),
          fetchChannels(guildId).catch(() => []),
          fetchRoles(guildId).catch(() => []),
        ]);

        setConfig(configData);
        setRawText(JSON.stringify(configData, null, 2));
        setChannels(channelData);
        setRoles(roleData);
        if (lowercaseSection === 'members') {
          setMembersData(await fetchMembersData(guildId));
        }
      } catch (err) {
        console.error('Failed to load page data:', err);
        setError('Failed to load configurations or server meta (roles/channels).');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [guildId, lowercaseSection]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    setError(null);

    try {
      await saveConfig(guildId, lowercaseSection, config[lowercaseSection]);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleRawSave = async () => {
    try {
      const parsed = JSON.parse(rawText);
      const saved = await saveFullConfig(guildId, parsed);
      setConfig(saved);
      setRawText(JSON.stringify(saved, null, 2));
      setSuccess(true);
      setError(null);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err instanceof SyntaxError ? 'Invalid JSON. Fix the syntax before saving.' : 'Failed to save raw configuration.');
      setSuccess(false);
    }
  };

  const handleToolSend = async (type) => {
    try {
      const payload = type === 'embed'
        ? {
            type,
            channelId: embedForm.channelId,
            title: embedForm.title,
            description: embedForm.description,
            color: Number.parseInt(embedForm.color.replace('#', ''), 16),
            fields: embedForm.fields.split('\n').filter(Boolean).map((line) => {
              const [name, ...value] = line.split('|');
              return { name, value: value.join('|') || name, inline: false };
            }),
          }
        : { type, ...announceForm };
      await sendToolMessage(guildId, payload);
      setSuccess(type === 'embed' ? 'Embed sent successfully.' : 'Announcement sent successfully.');
      setError(null);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(err.message || 'Failed to send message.');
      setSuccess(false);
    }
  };

  const updateField = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      [lowercaseSection]: {
        ...prev[lowercaseSection],
        [field]: value,
      },
    }));
  };

  const updateNestedField = (subSection, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [lowercaseSection]: {
        ...prev[lowercaseSection],
        [subSection]: {
          ...prev[lowercaseSection][subSection],
          [field]: value,
        },
      },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-gray-400">
        <span className="text-lg font-semibold animate-pulse">Loading settings...</span>
      </div>
    );
  }

  const sectionData = config?.[lowercaseSection];

  if (!sectionData) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-red-500">Error</h1>
        <p className="text-gray-400 mt-2">The configuration section "{section}" does not exist.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="p-8 max-w-4xl mx-auto space-y-8 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-gray-800 space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{section} Settings</h1>
          <p className="text-sm text-gray-400 mt-1">{section} bölməsinin FoxCraft parametrlərini dəyiş.</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center px-5 py-2 bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-gray-700 text-white font-semibold rounded-md transition-all duration-200 shadow"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Notifications */}
      {success && (
        <div role="status" className="bg-emerald-500/10 border border-emerald-500 text-emerald-400 p-4 rounded-lg text-sm font-medium">
          ✓ {typeof success === 'string' ? success : 'Configuration updated successfully!'}
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-500/10 border border-red-500 text-red-500 p-4 rounded-lg text-sm font-medium">
          ❌ {error}
        </div>
      )}

      {/* Form Content */}
      <div className="space-y-6">
        {lowercaseSection === 'overview' && (
          <Section title="General Prefix & Info" description="Basic bot credentials and server prefixes.">
            <TextInput
              label="Bot Prefix"
              description="The prefix used to trigger general bot command execution."
              value={sectionData.prefix}
              onChange={(v) => updateField('prefix', v)}
            />
            <TextInput
              label="Bot Language"
              description="Select standard primary language of server communication."
              value={sectionData.language}
              onChange={(v) => updateField('language', v)}
            />
          </Section>
        )}

        {lowercaseSection === 'setup' && (
          <Section title="Administrator Roles" description="Define role structures for command authorities.">
            <RoleSelect
              label="Administrator Roles"
              description="FoxCraft ayarlarını tam dəyişə bilən rollar."
              value={sectionData.adminRoles}
              roles={roles}
              onChange={(v) => updateField('adminRoles', v)}
              multi
            />
            <RoleSelect
              label="Moderator Roles"
              description="Roles authorized to execute moderation commands."
              value={sectionData.modRoles}
              roles={roles}
              onChange={(v) => updateField('modRoles', v)}
              multi
            />
            <RoleSelect
              label="Muted Role"
              description="Role applied to muted server participants."
              value={[sectionData.mutedRole]}
              roles={roles}
              onChange={(v) => updateField('mutedRole', v[0] || '')}
            />
          </Section>
        )}

        {lowercaseSection === 'features' && (
          <Section title="Enabled Plugins" description="Turn major features on or off.">
            <Toggle
              label="Enable Leveling System"
              description="Track XP and manage automated roles."
              checked={sectionData.leveling}
              onChange={(v) => updateField('leveling', v)}
            />
            <Toggle
              label="Enable Support Tickets"
              description="Allow members to open private helper chats."
              checked={sectionData.tickets}
              onChange={(v) => updateField('tickets', v)}
            />
            <Toggle
              label="Enable Fun & Games"
              description="Access 8ball, coinflips, mock, and other entertainment utilities."
              checked={sectionData.fun}
              onChange={(v) => updateField('fun', v)}
            />
          </Section>
        )}

        {lowercaseSection === 'server' && (
          <>
            <Section title="Welcome Message Setup" description="Greet newly arrived users in style.">
              <Toggle
                label="Enable Welcome Messages"
                checked={sectionData.welcome.enabled}
                onChange={(v) => updateNestedField('welcome', 'enabled', v)}
              />
              {sectionData.welcome.enabled && (
                <>
                  <ChannelSelect
                    label="Welcome Channel"
                    value={sectionData.welcome.channel}
                    channels={channels}
                    onChange={(v) => updateNestedField('welcome', 'channel', v)}
                  />
                  <TextInput
                    label="Welcome Template text"
                    value={sectionData.welcome.message}
                    onChange={(v) => updateNestedField('welcome', 'message', v)}
                  />
                </>
              )}
            </Section>

            <Section title="Auto-role & Voice" description="Automatic action on user joining.">
              <Toggle
                label="Enable Join Auto-role"
                checked={sectionData.autoRole.enabled}
                onChange={(v) => updateNestedField('autoRole', 'enabled', v)}
              />
              {sectionData.autoRole.enabled && (
                <RoleSelect
                  label="Join Roles"
                  value={sectionData.autoRole.roles}
                  roles={roles}
                  onChange={(v) => updateNestedField('autoRole', 'roles', v)}
                  multi
                />
              )}
            </Section>
          </>
        )}

        {lowercaseSection === 'leveling' && (
          <Section title="Experience Settings" description="Configure level and automated role reward schedules.">
            <Toggle
              label="Enable XP Accrual"
              checked={sectionData.enabled}
              onChange={(v) => updateField('enabled', v)}
            />
            <NumberInput
              label="XP Gain Multiplier"
              description="Control level-up speed (e.g. 1.0, 2.0)."
              value={sectionData.xpRate}
              min={1}
              max={10}
              onChange={(v) => updateField('xpRate', v)}
            />
            <NumberInput
              label="Chat Cooldown (seconds)"
              description="Minimum delay between XP-earning chat events."
              value={sectionData.cooldown}
              min={5}
              max={300}
              onChange={(v) => updateField('cooldown', v)}
            />
            <TextInput
              label="Level Up Chat Template"
              value={sectionData.levelUpMessage}
              onChange={(v) => updateField('levelUpMessage', v)}
            />
          </Section>
        )}

        {lowercaseSection === 'security' && (
          <Section title="Guard Filters & Anti-Spam" description="Defend the community using automated protection filters.">
            <Toggle
              label="Anti-Flood Guard"
              description="Warn and rate limit rapid message bursts."
              checked={sectionData.antiFlood.enabled}
              onChange={(v) => updateNestedField('antiFlood', 'enabled', v)}
            />
            {sectionData.antiFlood.enabled && (
              <NumberInput
                label="Max Messages Trigger"
                value={sectionData.antiFlood.threshold}
                onChange={(v) => updateNestedField('antiFlood', 'threshold', v)}
              />
            )}
            <Toggle
              label="Word filter guard"
              description="Sanitize offensive chat contents."
              checked={sectionData.filter.enabled}
              onChange={(v) => updateNestedField('filter', 'enabled', v)}
            />
          </Section>
        )}

        {lowercaseSection === 'logs' && (
          <Section title="Activity Logs" description="Keep tracking server activity audits.">
            <Toggle
              label="Enable Event Logs"
              checked={sectionData.eventLogs.enabled}
              onChange={(v) => updateNestedField('eventLogs', 'enabled', v)}
            />
            {sectionData.eventLogs.enabled && (
              <ChannelSelect
                label="Log Destination Channel"
                value={sectionData.eventLogs.channel}
                channels={channels}
                onChange={(v) => updateNestedField('eventLogs', 'channel', v)}
              />
            )}
          </Section>
        )}

        {lowercaseSection === 'tickets' && (
          <Section title="Support Ticket Setup" description="Manage user helper category locations.">
            <Toggle
              label="Enable Tickets System"
              checked={sectionData.enabled}
              onChange={(v) => updateField('enabled', v)}
            />
            <TextInput
              label="Category Name"
              description="Group containing active helper chats."
              value={sectionData.category}
              onChange={(v) => updateField('category', v)}
            />
            <NumberInput
              label="Max Active Tickets Per User"
              value={sectionData.settings.limit}
              onChange={(v) => updateNestedField('settings', 'limit', v)}
            />
          </Section>
        )}

        {lowercaseSection === 'fun' && (
          <Section title="Fun Channels" description="Interactive channel configurations.">
            <Toggle
              label="Counting Game"
              checked={sectionData.counting.enabled}
              onChange={(v) => updateNestedField('counting', 'enabled', v)}
            />
            {sectionData.counting.enabled && (
              <ChannelSelect
                label="Counting Channel"
                value={sectionData.counting.channel}
                channels={channels}
                onChange={(v) => updateNestedField('counting', 'channel', v)}
              />
            )}

            {lowercaseSection === 'members' && (
              <>
                <Section title="Users" description="Guild members returned by Discord. Search is handled by the Discord member API.">
                  <div className="flex gap-2">
                    <input
                      value={memberSearch}
                      onChange={(e) => setMemberSearch(e.target.value)}
                      placeholder="Search members"
                      className="flex-1 px-3 py-2 bg-[#23272a] text-white border border-gray-700 rounded-md"
                    />
                    <button type="button" onClick={async () => { setMemberPage(0); setMembersData(await fetchMembersData(guildId, memberSearch)); }} className="px-4 py-2 bg-[#5865F2] rounded-md">Search</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-gray-400 border-b border-gray-700"><tr><th className="py-2">User</th><th>Username</th><th>Joined</th></tr></thead>
                      <tbody>
                        {membersData.members.slice(memberPage * 25, memberPage * 25 + 25).map((member) => (
                          <tr key={member.user.id} className="border-b border-gray-800">
                            <td className="py-2">{member.nick || member.user.global_name || member.user.username}</td>
                            <td className="text-gray-400">{member.user.username}</td>
                            <td className="text-gray-400">{member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!membersData.members.length && <p className="py-4 text-gray-500">No members found.</p>}
                  </div>
                  <div className="flex justify-between">
                    <button type="button" disabled={memberPage === 0} onClick={() => setMemberPage((page) => page - 1)} className="px-3 py-1 bg-[#2c2f33] rounded disabled:opacity-40">Previous</button>
                    <span className="text-xs text-gray-500 self-center">Page {memberPage + 1}</span>
                    <button type="button" disabled={(memberPage + 1) * 25 >= membersData.members.length} onClick={() => setMemberPage((page) => page + 1)} className="px-3 py-1 bg-[#2c2f33] rounded disabled:opacity-40">Next</button>
                  </div>
                </Section>
                <Section title="Infractions" description="Moderation history from the bot's persisted data.">
                  {membersData.infractions.length ? (
                    <div className="space-y-2">{membersData.infractions.map((infraction, index) => <pre key={index} className="bg-[#1c1e22] p-3 rounded text-xs overflow-auto">{JSON.stringify(infraction, null, 2)}</pre>)}</div>
                  ) : <p className="text-gray-400">Infractions are not yet tracked by the bot.</p>}
                </Section>
                <Section title="Invites" description="Active invite links and usage counts.">
                  {membersData.invites.length ? membersData.invites.map((invite) => <div key={invite.code} className="flex justify-between border-b border-gray-800 py-2"><span>discord.gg/{invite.code}</span><span className="text-gray-400">{invite.uses || 0} uses</span></div>) : <p className="text-gray-400">No active invites found.</p>}
                </Section>
              </>
            )}

            {lowercaseSection === 'tools' && (
              <>
                <Section title="Embed Sender" description="Send a formatted embed through the bot. One field per line: name|value.">
                  <TextInput label="Title" value={embedForm.title} onChange={(value) => setEmbedForm({ ...embedForm, title: value })} />
                  <TextInput label="Description" value={embedForm.description} onChange={(value) => setEmbedForm({ ...embedForm, description: value })} />
                  <TextInput label="Color" value={embedForm.color} onChange={(value) => setEmbedForm({ ...embedForm, color: value })} />
                  <TextInput label="Fields" value={embedForm.fields} onChange={(value) => setEmbedForm({ ...embedForm, fields: value })} />
                  <ChannelSelect label="Channel" value={embedForm.channelId} channels={channels} onChange={(value) => setEmbedForm({ ...embedForm, channelId: value })} />
                  <button type="button" onClick={() => handleToolSend('embed')} className="px-4 py-2 bg-[#5865F2] rounded-md">Send Embed</button>
                </Section>
                <Section title="Announce" description="Send a plain announcement with optional mention parsing.">
                  <TextInput label="Message" value={announceForm.content} onChange={(value) => setAnnounceForm({ ...announceForm, content: value })} />
                  <ChannelSelect label="Channel" value={announceForm.channelId} channels={channels} onChange={(value) => setAnnounceForm({ ...announceForm, channelId: value })} />
                  <Toggle label="Allow @everyone/@here" checked={announceForm.mentionEveryone} onChange={(value) => setAnnounceForm({ ...announceForm, mentionEveryone: value })} />
                  <button type="button" onClick={() => handleToolSend('announce')} className="px-4 py-2 bg-[#5865F2] rounded-md">Send Announcement</button>
                </Section>
                <Section title="Raw Config Editor" description="Invalid structure can break bot behavior. Save only valid, intentional configuration JSON.">
                  <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={24} className="w-full p-3 bg-[#1c1e22] text-indigo-200 border border-gray-700 rounded-md font-mono text-xs" />
                  <button type="button" onClick={handleRawSave} className="px-4 py-2 bg-[#5865F2] rounded-md">Save Raw Config</button>
                </Section>
              </>
            )}
          </Section>
        )}

        {/* Fallback Section editor (JSON) */}
        {!['overview', 'setup', 'features', 'server', 'leveling', 'security', 'logs', 'tickets', 'fun'].includes(lowercaseSection) && (
          <Section title="Custom Section Settings" description="Directly configure keys for this settings module.">
            <div className="bg-[#1c1e22] rounded p-4 border border-gray-800">
              <pre className="text-xs text-indigo-300 font-mono overflow-auto max-h-96">
                {JSON.stringify(sectionData, null, 2)}
              </pre>
              <p className="text-xs text-gray-500 mt-4 italic">
                Detailed GUI editors for "{section}" are coming soon. Use the bot's raw configurations for advanced setups.
              </p>
            </div>
          </Section>
        )}
      </div>
    </form>
  );
}
