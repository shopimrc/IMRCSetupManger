import { AppColors } from '../../theme/colors';
import StatCard from '../components/StatCard';

export default function SetupsButton({ count, onPress, cardStyle, valueStyle, iconBubbleStyle }) {
  return (
    <StatCard
      label="Setups"
      count={count}
      icon="📋"
      color={AppColors.setups}
      onPress={onPress}
      cardStyle={cardStyle}
      valueStyle={valueStyle}
      iconBubbleStyle={iconBubbleStyle}
    />
  );
}
