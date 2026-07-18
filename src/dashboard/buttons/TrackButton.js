import { AppColors } from '../../theme/colors';
import StatCard from '../components/StatCard';

export default function TrackButton({ count, onPress, cardStyle, valueStyle, iconBubbleStyle }) {
  return (
    <StatCard
      label="Tracks"
      count={count}
      icon="📍"
      color={AppColors.track}
      onPress={onPress}
      cardStyle={cardStyle}
      valueStyle={valueStyle}
      iconBubbleStyle={iconBubbleStyle}
    />
  );
}
