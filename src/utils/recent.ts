export const saveToRecentlyViewed = (product: {
    id: number;
    name: string;
    image: string;
    price: string | number;
  }) => {
    let recent = JSON.parse(localStorage.getItem('recentItems') || '[]');
    recent = recent.filter((item: any) => item.id !== product.id);
    recent.unshift(product);
    if (recent.length > 6) recent = recent.slice(0, 6);
    localStorage.setItem('recentItems', JSON.stringify(recent));
  };
  
  export const getRecentlyViewed = () => {
    return JSON.parse(localStorage.getItem('recentItems') || '[]');
  };
  