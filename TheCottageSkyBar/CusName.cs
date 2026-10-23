using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace TheCottageSkyBar
{
    public partial class CusName : Form
    {
        public CusName()
        {
            InitializeComponent();
        }

        private void CusName_Load(object sender, EventArgs e)
        {
            this.ActiveControl = textBox1;
        }

        private void button2_Click(object sender, EventArgs e)
        {
            this.Close();
        }

        private void comboBox1_SelectedIndexChanged(object sender, EventArgs e)
        {
            try {
                textBox1.Text = comboBox1.SelectedItem.ToString();
            }
            catch (Exception)
            {

            }
        }

        private void reset()
        {
            textBox1.Text = "";
            comboBox1.SelectedIndex = -1;
            this.ActiveControl = textBox1;
        }

        SellForm sellForm;
        private void button1_Click(object sender, EventArgs e)
        {
            if (textBox1.Text != "")
            {
                sellForm = new SellForm(textBox1.Text);
                reset();
                sellForm.Show();
               
                
            }
            else
            {
                MessageBox.Show("ใส่ชื่อลูกค้าด้วย");
            }

        }

        private void button3_Click(object sender, EventArgs e)
        {
            reset();

        }
    }
}
