import { AppColors } from '../../theme/colors';
import StatCard from '../components/StatCard';

export default function VehicleButton({ count, onPress, cardStyle, valueStyle, iconBubbleStyle }) {
  return (
    <StatCard
      label="Vehicles"
      count={count}
      icon="🚗"
      color={AppColors.vehicle}
      onPress={onPress}
      cardStyle={cardStyle}
      valueStyle={valueStyle}
      iconBubbleStyle={iconBubbleStyle}
    />
  );
}
