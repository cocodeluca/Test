import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Import screens
import MobileDashboard from './screens/MobileDashboard';
import MobilePropertiesScreen from './screens/MobilePropertiesScreen';
import MobileMortgagesScreen from './screens/MobileMortgagesScreen';

// Import mock data
import { mockProperties, mockMortgages } from '../../common/data/mockData';

const Tab = createBottomTabNavigator();

// Simple icon components using text/emoji
const DashboardIcon = ({ color: _color }: { color: string }) => (
  <Text style={{ fontSize: 20 }}>📊</Text>
);

const PropertiesIcon = ({ color: _color }: { color: string }) => (
  <Text style={{ fontSize: 20 }}>🏢</Text>
);

const MortgagesIcon = ({ color: _color }: { color: string }) => (
  <Text style={{ fontSize: 20 }}>📄</Text>
);

export default function MobileApp() {
  return (
    <>
      <StatusBar />
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: true,
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#94a3b8',
            tabBarStyle: {
              backgroundColor: '#f8fafc',
              borderTopColor: '#e2e8f0',
              paddingBottom: 5,
            },
            headerStyle: {
              backgroundColor: '#ffffff',
              borderBottomColor: '#e2e8f0',
              borderBottomWidth: 1,
            },
            headerTitleStyle: {
              fontWeight: '600',
              fontSize: 18,
            },
          }}
        >
          <Tab.Screen
            name="Dashboard"
            options={{
              title: 'Dashboard',
              tabBarIcon: DashboardIcon,
            }}
          >
            {() => <MobileDashboard properties={mockProperties} mortgages={mockMortgages} />}
          </Tab.Screen>

          <Tab.Screen
            name="Properties"
            options={{
              title: 'Properties',
              tabBarIcon: PropertiesIcon,
            }}
          >
            {() => <MobilePropertiesScreen />}
          </Tab.Screen>

          <Tab.Screen
            name="Mortgages"
            options={{
              title: 'Mortgages',
              tabBarIcon: MortgagesIcon,
            }}
          >
            {() => <MobileMortgagesScreen />}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

