const fs = require('fs');
let text = fs.readFileSync('src/components/ManageCategoriesModal.tsx', 'utf8');

const replacement = `
export default function ManageCategoriesModal({ isOpen, onClose }: Props) {
  const { settings, updateSettings, inventory } = useAccounting();
  
  const currentCategories = settings.categories || [];
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<CategoryDefinition>>({});

  if (!isOpen) return null;

  const handleAdd = () => {
    const newId = 'cat_' + Date.now();
    const newCat: CategoryDefinition = {
      id: newId,
      name: 'تصنيف جديد',
      nameEn: 'New Category',
      prefix: 'CAT',
      description: '',
      defaultUnit: 'حبة',
      color: 'bg-slate-50 text-slate-700'
    };
    
    updateSettings({
      ...settings,
      categories: [...currentCategories, newCat]
    });
    setEditingId(newId);
    setEditData(newCat);
  };

  const handleSave = () => {
    if (!editingId) return;
    
    updateSettings({
      ...settings,
      categories: currentCategories.map(c => c.id === editingId ? { ...c, ...editData } as CategoryDefinition : c)
    });
    
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    const isUsed = inventory.some(item => item.category === id);
    if (isUsed) {
      alert('لا يمكن حذف هذا التصنيف لارتباطه بأصناف مسجلة.');
      return;
    }
    
    if (window.confirm('هل أنت متأكد من حذف التصنيف؟')) {
      updateSettings({
        ...settings,
        categories: currentCategories.filter(c => c.id !== id)
      });
    }
  };

  const allCategories = currentCategories;
`;

text = text.replace(/export default function ManageCategoriesModal\(\{ isOpen, onClose \}: Props\) \{[\s\S]*?const allCategories = \[[^\]]*\];/m, replacement);
fs.writeFileSync('src/components/ManageCategoriesModal.tsx', text);
