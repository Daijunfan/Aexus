import { useState, useRef } from 'react';
import { Upload, Shuffle, X } from 'lucide-react';
import { Popover, MenuItem } from '../ui';
import { saveAsset } from './Editor';
import { useWorkspace } from '../store';

const emojis =
  '🌱 🌿 🍃 🌳 🌲 🌵 🌻 🌼 🌸 🌷 🍀 🍁 ☀️ 🌤️ 🌙 ⭐ ✨ 🌈 🔥 💧 🌊 🏔️ 🌍 🪐 🏠 🏡 ☕ 🍵 🍎 🍋 🍊 🥑 🍄 🍞 🍰 🎂 🐈 🐕 🦊 🐼 🦋 🐝 🐳 🐚 👋 🙌 💪 🧠 👀 ❤️ 🧡 💛 💚 💙 💜 🎯 💡 📌 📍 🚀 🎨 🎬 🎵 🎧 📷 🎮 🧩 🎲 🏆 🏃 🚲 ✈️ 🧳 💼 💻 ⌨️ 🛠️ ⚙️ 🔑 🔒 📦 📚 📖 📓 📝 📄 📋 🗂️ 🗃️ 📅 🗓️ 📊 📈 🔍 ✅ ☑️ 🕰️ ⏳ 🔔 💬 🖇️ 💎 🪴 🕊️ 🪵 🪶 🧭 🪄'.split(
    ' ',
  );
export function EmojiPicker({
  x,
  y,
  value,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  value: string;
  onChange: (icon: string) => void;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState('');
  return (
    <Popover x={x} y={y} onClose={onClose} width={340} className="emoji-picker">
      <div className="picker-heading">
        表情符号
        <button
          title="随机图标"
          onClick={() => {
            onChange(emojis[Math.floor(Math.random() * emojis.length)]);
            onClose();
          }}
        >
          <Shuffle size={16} />
        </button>
      </div>
      <input
        placeholder="输入或粘贴一个表情符号…"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && custom.trim()) {
            onChange([...new Intl.Segmenter().segment(custom.trim())][0].segment);
            onClose();
          }
        }}
      />
      <div className="emoji-grid">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            className={value === emoji ? 'chosen' : ''}
            aria-label={emoji}
            onClick={() => {
              onChange(emoji);
              onClose();
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
      <MenuItem
        icon={<X size={15} />}
        onClick={() => {
          onChange('');
          onClose();
        }}
      >
        移除图标
      </MenuItem>
    </Popover>
  );
}
export const covers = [
  { id: 'paper', name: '纸上山丘' },
  { id: 'sand', name: '暖沙' },
  { id: 'sage', name: '鼠尾草' },
  { id: 'dusk', name: '暮色' },
  { id: 'blue', name: '远山' },
  { id: 'pink', name: '浅樱' },
  { id: 'ink', name: '水墨' },
  { id: 'sunset', name: '日落' },
];
export function CoverPicker({
  x,
  y,
  onChange,
  onClose,
}: {
  x: number;
  y: number;
  onChange: (cover: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { notify } = useWorkspace();
  return (
    <Popover x={x} y={y} width={380} onClose={onClose}>
      <div className="picker-heading">选择封面</div>
      <div className="cover-grid">
        {covers.map((cover) => (
          <button
            key={cover.id}
            className={`cover-${cover.id}`}
            title={cover.name}
            onClick={() => {
              onChange(cover.id);
              onClose();
            }}
          />
        ))}
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            onChange(await saveAsset(file));
            onClose();
          } catch {
            notify('封面保存失败，请重试');
          }
        }}
      />
      <MenuItem icon={<Upload size={15} />} onClick={() => ref.current?.click()}>
        上传图片
      </MenuItem>
      <MenuItem
        icon={<X size={15} />}
        onClick={() => {
          onChange(null);
          onClose();
        }}
      >
        移除封面
      </MenuItem>
    </Popover>
  );
}
